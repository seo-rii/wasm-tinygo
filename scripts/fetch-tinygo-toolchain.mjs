import { spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { resolveTinyGoToolchainPaths, toolchainIsReady } from './tinygo-toolchain-paths.mjs'

const paths = resolveTinyGoToolchainPaths()

await mkdir(paths.cacheDir, { recursive: true })

if (!(await toolchainIsReady(paths))) {
  const archiveTempPath = `${paths.archivePath}.download`
  if (!process.env.WASM_TINYGO_TINYGO_ARCHIVE_PATH) {
    const response = await fetch(paths.releaseUrl)
    if (!response.ok || !response.body) {
      throw new Error(`TinyGo release fetch failed: ${response.status} ${response.statusText}`)
    }
    await rm(archiveTempPath, { force: true })
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archiveTempPath))
    await rename(archiveTempPath, paths.archivePath)
  }

  await rm(paths.extractDir, { recursive: true, force: true })
  await mkdir(paths.extractDir, { recursive: true })
  const extract = spawnSync('dpkg-deb', ['-x', paths.archivePath, paths.extractDir], {
    stdio: 'inherit',
  })
  if (extract.status !== 0) {
    process.exit(extract.status ?? 1)
  }
}

if (!(await toolchainIsReady(paths))) {
  throw new Error(`TinyGo toolchain is incomplete under ${paths.extractDir}`)
}

await writeFile(paths.manifestPath, `${JSON.stringify({
  archivePath: paths.archivePath,
  binPath: paths.binPath,
  releaseUrl: paths.releaseUrl,
  rootPath: paths.rootPath,
  version: paths.version,
}, null, 2)}
`)

console.log(`Prepared TinyGo ${paths.version}`)
console.log(`tinygo binary: ${paths.binPath}`)
console.log(`TINYGOROOT: ${paths.rootPath}`)
