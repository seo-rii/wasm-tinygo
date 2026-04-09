import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ensureTinyGoSourceReady } from './fetch-tinygo-source.mjs'
import { patchTinyGoSourceForWasi } from './patch-tinygo-wasi.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const classifyTinyGoCompilerBlockers = (details) => {
  const blockers = []
  const push = (value, pattern) => {
    if (pattern.test(details) && !blockers.includes(value)) {
      blockers.push(value)
    }
  }
  push('serial', /go\.bug\.st\/serial|nativeGetDetailedPortsList|nativeGetPortsList|nativeOpen/i)
  push('tty', /github\.com\/mattn\/go-tty|tty_unix\.go|unix\.Termios|IoctlGetTermios/i)
  push('flock', /github\.com\/gofrs\/flock|syscall\.Flock|LOCK_EX|LOCK_SH|LOCK_UN/i)
  push('go-llvm', /tinygo\.org\/x\/go-llvm|string\.go:.*TypeKind|llvm_dep\.go:.*run_build_sh/i)
  push('tinygo-cgo', /github\.com\/tinygo-org\/tinygo\/cgo|cgo\/cgo\.go:.*clangCursor|cgo\/libclang\.go/i)
  return blockers
}

const runGo = ({ argv, cwd, env }) => {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    throw new Error(`TinyGo wasm compiler build failed: go is not available (${result.error.message})`)
  }
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].join('').trim()
    throw new Error(
      details === ''
        ? `TinyGo wasm compiler build failed (exit ${result.status ?? 1})`
        : `TinyGo wasm compiler build failed: ${details}`,
    )
  }
  return result
}

const tryRunGo = ({ argv, cwd, env }) => {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    throw new Error(`TinyGo wasm compiler build failed: go is not available (${result.error.message})`)
  }
  return result
}

const resolveCompilerPaths = async () => {
  const outputPath =
    process.env.WASM_TINYGO_COMPILER_OUTPUT_PATH ??
    path.join(rootDir, 'public', 'tools', 'tinygo-compiler.wasm')
  const mainPath = process.env.WASM_TINYGO_COMPILER_MAIN_PATH ?? '.'
  return { outputPath, mainPath }
}

export const buildTinyGoCompilerWasm = async () => {
  const source = await ensureTinyGoSourceReady()
  const { outputPath, mainPath } = await resolveCompilerPaths()
  const resolvedMainPath = path.isAbsolute(mainPath)
    ? mainPath
    : path.join(source.rootPath, mainPath)
  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  const env = {
    ...process.env,
    CGO_ENABLED: '0',
    GOOS: process.env.WASM_TINYGO_COMPILER_GOOS ?? 'wasip1',
    GOARCH: process.env.WASM_TINYGO_COMPILER_GOARCH ?? 'wasm',
    GOWORK: 'off',
  }

  let buildMode = 'direct'
  let fallbackReason = null
  let directFailureReason = null
  let patchedEntryFailureReason = null
  let blockers = []
  const initialBuild = tryRunGo({
    argv: ['go', 'build', '-o', outputPath, resolvedMainPath],
    cwd: source.rootPath,
    env,
  })
  if (initialBuild.status !== 0) {
    const patch = await patchTinyGoSourceForWasi(source.rootPath)
    directFailureReason = [initialBuild.stdout, initialBuild.stderr].join('').trim()
    blockers = classifyTinyGoCompilerBlockers(directFailureReason)
    const patchedBuild = tryRunGo({
      argv: ['go', 'build', '-o', outputPath, patch.commandPath],
      cwd: source.rootPath,
      env,
    })
    if (patchedBuild.status === 0) {
      buildMode = 'patched-browser-entry'
      fallbackReason = directFailureReason
    } else {
      buildMode = 'patched-wasi-probe'
      patchedEntryFailureReason = [patchedBuild.stdout, patchedBuild.stderr].join('').trim()
      fallbackReason = patchedEntryFailureReason
      blockers = classifyTinyGoCompilerBlockers(patchedEntryFailureReason)
      runGo({
        argv: ['go', 'build', '-o', outputPath, patch.probeCommandPath ?? patch.commandPath],
        cwd: source.rootPath,
        env,
      })
    }
  }

  const manifestPath =
    process.env.WASM_TINYGO_COMPILER_MANIFEST_PATH ??
    path.join(outputDir, 'tinygo-compiler.json')
  const wasmBytes = await readFile(outputPath)
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        sourceRef: source.sourceRef,
        sourceUrl: source.sourceUrl,
        sourceVersion: source.sourceVersion,
        buildMode,
        fallbackReason,
        directFailureReason,
        patchedEntryFailureReason,
        blockers,
        artifactKind: buildMode === 'patched-wasi-probe' ? 'bootstrap' : 'compiler',
        outputPath,
        wasmBytes: wasmBytes.length,
      },
      null,
      2,
    )}\n`,
  )

  return { outputPath, manifestPath, source }
}

export { classifyTinyGoCompilerBlockers }

const run = async () => {
  const result = await buildTinyGoCompilerWasm()
  console.log(`Built TinyGo compiler wasm at ${path.relative(rootDir, result.outputPath)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await run()
}
