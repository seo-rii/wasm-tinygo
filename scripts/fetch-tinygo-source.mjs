import { spawnSync } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { resolveTinyGoToolchainPaths } from './tinygo-toolchain-paths.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const runGit = ({ args, cwd, label }) => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    throw new Error(`TinyGo source fetch failed: git is not available (${result.error.message})`)
  }
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].join('').trim()
    throw new Error(
      details === ''
        ? `TinyGo source fetch failed running ${label} (exit ${result.status ?? 1})`
        : `TinyGo source fetch failed running ${label}: ${details}`,
    )
  }
  return result
}

const pathExists = async (value) => {
  try {
    await stat(value)
    return true
  } catch {
    return false
  }
}

export const resolveTinyGoSourcePaths = () => {
  const toolchain = resolveTinyGoToolchainPaths()
  const sourceRootOverride = process.env.WASM_TINYGO_SOURCE_ROOT ?? null
  const sourceUrl = process.env.WASM_TINYGO_SOURCE_URL ?? 'https://github.com/tinygo-org/tinygo.git'
  const sourceVersion = process.env.WASM_TINYGO_SOURCE_VERSION ?? toolchain.version
  const sourceRef = process.env.WASM_TINYGO_SOURCE_REF ?? `v${sourceVersion}`
  const cacheDir = process.env.WASM_TINYGO_SOURCE_CACHE_DIR ?? path.join(rootDir, '.cache', 'tinygo-src')
  return {
    cacheDir,
    sourceRef,
    sourceRootOverride,
    sourceUrl,
    sourceVersion,
  }
}

export const ensureTinyGoSourceReady = async () => {
  const paths = resolveTinyGoSourcePaths()
  if (paths.sourceRootOverride) {
    return {
      rootPath: paths.sourceRootOverride,
      sourceRef: paths.sourceRef,
      sourceUrl: paths.sourceUrl,
      sourceVersion: paths.sourceVersion,
    }
  }

  await mkdir(path.dirname(paths.cacheDir), { recursive: true })
  if (!(await pathExists(paths.cacheDir))) {
    runGit({
      args: ['clone', '--depth', '1', '--branch', paths.sourceRef, paths.sourceUrl, paths.cacheDir],
      cwd: rootDir,
      label: `git clone ${paths.sourceRef}`,
    })
    return {
      rootPath: paths.cacheDir,
      sourceRef: paths.sourceRef,
      sourceUrl: paths.sourceUrl,
      sourceVersion: paths.sourceVersion,
    }
  }

  runGit({
    args: ['fetch', '--tags', paths.sourceUrl],
    cwd: paths.cacheDir,
    label: 'git fetch --tags',
  })
  runGit({
    args: ['checkout', paths.sourceRef],
    cwd: paths.cacheDir,
    label: `git checkout ${paths.sourceRef}`,
  })

  return {
    rootPath: paths.cacheDir,
    sourceRef: paths.sourceRef,
    sourceUrl: paths.sourceUrl,
    sourceVersion: paths.sourceVersion,
  }
}

const run = async () => {
  const result = await ensureTinyGoSourceReady()
  console.log(`Prepared TinyGo source ${result.sourceRef}`)
  console.log(`tinygo source root: ${result.rootPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await run()
}
