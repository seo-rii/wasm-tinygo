import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

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
