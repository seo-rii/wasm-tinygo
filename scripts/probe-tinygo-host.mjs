import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { ConsoleStdout, File, OpenFile, WASI, WASIProcExit } from '@bjorn3/browser_wasi_shim'

import { resolveTinyGoToolchainPaths, toolchainIsReady } from './tinygo-toolchain-paths.mjs'

const paths = resolveTinyGoToolchainPaths()
if (!(await toolchainIsReady(paths))) {
  throw new Error(`TinyGo toolchain is not ready: run node ./scripts/fetch-tinygo-toolchain.mjs first`)
}

const requestPath = process.env.WASM_TINYGO_HOST_PROBE_REQUEST_PATH
const request = requestPath ? JSON.parse(await readFile(requestPath, 'utf8')) : null
if (request?.command && request.command !== 'build') {
  throw new Error(`unsupported TinyGo host probe command: ${request.command}`)
}
const expectedRuntimeLogs = Array.isArray(request?.expectedRuntimeLogs)
  ? request.expectedRuntimeLogs.map((logLine) => String(logLine))
  : (!request ? ['stdout tinygo-ok'] : null)

const workDir = process.env.WASM_TINYGO_HOST_PROBE_WORK_DIR ?? await mkdtemp(path.join(tmpdir(), 'wasm-tinygo-host-probe-'))
const mainPath = request?.entry ?? path.join(workDir, 'main.go')
const target = request?.target ?? 'wasip1'
const outputPath = process.env.WASM_TINYGO_HOST_PROBE_OUTPUT_PATH ?? request?.output ?? path.join(workDir, 'main.wasm')
const manifestPath = process.env.WASM_TINYGO_HOST_PROBE_MANIFEST_PATH ?? path.join(path.dirname(outputPath), 'tinygo-host-probe.json')
const goCachePath = process.env.GOCACHE ?? path.join(paths.rootDir, '.cache', 'tinygo-go-build')
let commandCwd = workDir

await mkdir(workDir, { recursive: true })
await mkdir(path.dirname(outputPath), { recursive: true })
await mkdir(goCachePath, { recursive: true })
if (!request) {
  await writeFile(mainPath, `package main

import "fmt"

func main() {
	fmt.Println("tinygo-ok")
}
`)
} else if (request.entry) {
  commandCwd = path.dirname(request.entry)
  let searchDir = commandCwd
  for (;;) {
    try {
      await access(path.join(searchDir, 'go.mod'))
      commandCwd = searchDir
      break
    } catch {
      const parentDir = path.dirname(searchDir)
      if (parentDir === searchDir) {
        break
      }
      searchDir = parentDir
    }
  }
}

const command = [paths.binPath, 'build', '-target', target]
if (request?.optimize) {
  command.push('-opt', request.optimize)
}
if (request?.scheduler) {
  command.push('-scheduler', request.scheduler)
}
if (request?.panic) {
  command.push('-panic', request.panic)
}
command.push('-o', outputPath, mainPath)
const tinygo = spawnSync(command[0], command.slice(1), {
  cwd: commandCwd,
  env: {
    ...process.env,
    GOCACHE: goCachePath,
    PATH: `${path.dirname(paths.binPath)}${path.delimiter}${process.env.PATH ?? ''}`,
    TINYGOROOT: paths.rootPath,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (tinygo.status !== 0) {
  process.stderr.write(tinygo.stdout)
  process.stderr.write(tinygo.stderr)
  process.exit(tinygo.status ?? 1)
}

const artifactStats = await stat(outputPath)
const infoCommand = [paths.binPath, 'info', '-target', target]
if (request?.scheduler) {
  infoCommand.push('-scheduler', request.scheduler)
}
const tinygoInfo = spawnSync(infoCommand[0], infoCommand.slice(1), {
  cwd: commandCwd,
  env: {
    ...process.env,
    GOCACHE: goCachePath,
    PATH: `${path.dirname(paths.binPath)}${path.delimiter}${process.env.PATH ?? ''}`,
    TINYGOROOT: paths.rootPath,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (tinygoInfo.status !== 0) {
  process.stderr.write(tinygoInfo.stdout)
  process.stderr.write(tinygoInfo.stderr)
  process.exit(tinygoInfo.status ?? 1)
}
const targetInfo = {
  buildTags: [],
  gc: '',
  goarch: '',
  goos: '',
  llvmTriple: '',
  scheduler: '',
}
for (const line of tinygoInfo.stdout.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (trimmed === '') {
    continue
  }
  if (trimmed.startsWith('LLVM triple:')) {
    targetInfo.llvmTriple = trimmed.slice('LLVM triple:'.length).trim()
    continue
  }
  if (trimmed.startsWith('GOOS:')) {
    targetInfo.goos = trimmed.slice('GOOS:'.length).trim()
    continue
  }
  if (trimmed.startsWith('GOARCH:')) {
    targetInfo.goarch = trimmed.slice('GOARCH:'.length).trim()
    continue
  }
  if (trimmed.startsWith('build tags:')) {
    targetInfo.buildTags = trimmed.slice('build tags:'.length).trim().split(/\s+/).filter(Boolean)
    continue
  }
  if (trimmed.startsWith('garbage collector:')) {
    targetInfo.gc = trimmed.slice('garbage collector:'.length).trim()
    continue
  }
  if (trimmed.startsWith('scheduler:')) {
    targetInfo.scheduler = trimmed.slice('scheduler:'.length).trim()
  }
}
const runtime = {
  executed: false,
  exitCode: null,
  logs: [],
}

if (process.env.WASM_TINYGO_HOST_PROBE_SKIP_RUNTIME === '1') {
  await writeFile(manifestPath, `${JSON.stringify({
    artifact: {
      path: outputPath,
      size: artifactStats.size,
    },
    command,
    runtime,
    target,
    targetInfo,
    toolchain: {
      binPath: paths.binPath,
      rootPath: paths.rootPath,
      version: paths.version,
    },
    workDir,
  }, null, 2)}
`)
  console.log(`Built TinyGo wasm artifact at ${outputPath}`)
  process.exit(0)
}

if (target !== 'wasip1') {
  runtime.reason = `runtime execution is only supported for wasip1 host probes`
  await writeFile(manifestPath, `${JSON.stringify({
    artifact: {
      path: outputPath,
      size: artifactStats.size,
    },
    command,
    runtime,
    target,
    targetInfo,
    toolchain: {
      binPath: paths.binPath,
      rootPath: paths.rootPath,
      version: paths.version,
    },
    workDir,
  }, null, 2)}
`)
  console.log(`Built TinyGo wasm artifact at ${outputPath}`)
  console.log(`Skipped runtime execution for target ${target}`)
  process.exit(0)
}

const logs = []
const wasi = new WASI(['tinygo-host-probe'], [], [
  new OpenFile(new File([])),
  ConsoleStdout.lineBuffered((line) => logs.push(`stdout ${line}`)),
  ConsoleStdout.lineBuffered((line) => logs.push(`stderr ${line}`)),
])
const wasmBytes = await readFile(outputPath)
const { instance } = await WebAssembly.instantiate(wasmBytes, {
  wasi_snapshot_preview1: wasi.wasiImport,
})

let exitCode = 0
try {
  exitCode = wasi.start(instance)
} catch (error) {
  if (error instanceof WASIProcExit) {
    exitCode = error.code
  } else {
    throw error
  }
}

assert.equal(exitCode, 0)
if (expectedRuntimeLogs) {
  assert.deepEqual(logs, expectedRuntimeLogs)
}

runtime.executed = true
runtime.exitCode = exitCode
runtime.logs = logs
await writeFile(manifestPath, `${JSON.stringify({
  artifact: {
    path: outputPath,
    size: artifactStats.size,
  },
  command,
  runtime,
  target,
  targetInfo,
  toolchain: {
    binPath: paths.binPath,
    rootPath: paths.rootPath,
    version: paths.version,
  },
  workDir,
}, null, 2)}
`)

console.log(`Built and ran TinyGo wasm artifact at ${outputPath}`)
