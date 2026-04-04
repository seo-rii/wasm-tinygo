import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ensureTinyGoSourceReady } from './fetch-tinygo-source.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

const resolveCompilerPaths = async () => {
  const outputPath =
    process.env.WASM_TINYGO_COMPILER_OUTPUT_PATH ??
    path.join(rootDir, 'public', 'tools', 'tinygo-compiler.wasm')
  const mainPath = process.env.WASM_TINYGO_COMPILER_MAIN_PATH ?? 'cmd/tinygo'
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

  runGo({
    argv: ['go', 'build', '-o', outputPath, resolvedMainPath],
    cwd: source.rootPath,
    env,
  })

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
        outputPath,
        wasmBytes: wasmBytes.length,
      },
      null,
      2,
    )}\n`,
  )

  return { outputPath, manifestPath, source }
}

const run = async () => {
  const result = await buildTinyGoCompilerWasm()
  console.log(`Built TinyGo compiler wasm at ${path.relative(rootDir, result.outputPath)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await run()
}
