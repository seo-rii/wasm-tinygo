import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { classifyTinyGoCompilerBlockers } from '../scripts/build-tinygo-compiler.mjs'

test('build-tinygo-compiler builds a tinygo compiler wasm from repo source', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'wasm-tinygo-compiler-build-'))
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  const sourceRoot = path.join(tempDir, 'tinygo')
  const mainDir = path.join(sourceRoot, 'cmd', 'tinygo')
  await mkdir(mainDir, { recursive: true })
  await writeFile(
    path.join(sourceRoot, 'go.mod'),
    `module example.com/tinygo

go 1.22
`,
  )
  await writeFile(
    path.join(mainDir, 'main.go'),
    `package main

func main() {
  println("tinygo-wasm-ok")
}
`,
  )

  const outputPath = path.join(tempDir, 'tinygo-compiler.wasm')
  const cwd = new URL('..', import.meta.url).pathname
  const scriptPath = new URL('../scripts/build-tinygo-compiler.mjs', import.meta.url).pathname
  const child = spawn(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      WASM_TINYGO_SOURCE_ROOT: sourceRoot,
      WASM_TINYGO_COMPILER_MAIN_PATH: 'cmd/tinygo',
      WASM_TINYGO_COMPILER_OUTPUT_PATH: outputPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })

  assert.equal(exitCode, 0, output)
  const wasmBytes = await readFile(outputPath)
  assert.equal(wasmBytes[0], 0x00)
  assert.equal(wasmBytes[1], 0x61)
  assert.equal(wasmBytes[2], 0x73)
  assert.equal(wasmBytes[3], 0x6d)
})

test('build-tinygo-compiler falls back to a patched tinygo wasi probe when the direct build fails', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'wasm-tinygo-compiler-fallback-'))
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  const sourceRoot = path.join(tempDir, 'tinygo')
  await mkdir(sourceRoot, { recursive: true })
  await writeFile(
    path.join(sourceRoot, 'go.mod'),
    `module github.com/tinygo-org/tinygo

go 1.22
`,
  )

  const outputPath = path.join(tempDir, 'tinygo-compiler.wasm')
  const manifestPath = path.join(tempDir, 'tinygo-compiler.json')
  const cwd = new URL('..', import.meta.url).pathname
  const scriptPath = new URL('../scripts/build-tinygo-compiler.mjs', import.meta.url).pathname
  const child = spawn(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      WASM_TINYGO_SOURCE_ROOT: sourceRoot,
      WASM_TINYGO_COMPILER_OUTPUT_PATH: outputPath,
      WASM_TINYGO_COMPILER_MANIFEST_PATH: manifestPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })

  assert.equal(exitCode, 0, output)
  const wasmBytes = await readFile(outputPath)
  assert.equal(wasmBytes[0], 0x00)
  assert.equal(wasmBytes[1], 0x61)
  assert.equal(wasmBytes[2], 0x73)
  assert.equal(wasmBytes[3], 0x6d)

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.buildMode, 'patched-wasi-probe')
  assert.equal(manifest.artifactKind, 'bootstrap')
  assert.deepEqual(manifest.blockers, [])
  assert.match(manifest.fallbackReason ?? '', /no Go files|build failed|directory not found/i)
})

test('classifyTinyGoCompilerBlockers identifies the current upstream wasi blockers', () => {
  const blockers = classifyTinyGoCompilerBlockers(`
# go.bug.st/serial/enumerator
enumerator.go:31:9: undefined: nativeGetDetailedPortsList
# github.com/mattn/go-tty
tty_unix.go:18:15: undefined: unix.Termios
# github.com/gofrs/flock
flock_unix.go:57:20: undefined: syscall.Flock
# tinygo.org/x/go-llvm
string.go:17:9: undefined: TypeKind
llvm_dep.go:18:7: undefined: run_build_sh
# github.com/tinygo-org/tinygo/cgo
cgo/cgo.go:61:21: undefined: clangCursor
`)
  assert.deepEqual(blockers, ['serial', 'tty', 'flock', 'go-llvm', 'tinygo-cgo'])
})
