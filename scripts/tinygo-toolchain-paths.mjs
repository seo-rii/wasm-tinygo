import path from 'node:path'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const defaultArchitectures = {
  arm: 'armhf',
  arm64: 'arm64',
  x64: 'amd64',
}

export const resolveTinyGoToolchainPaths = () => {
  const version = process.env.WASM_TINYGO_TINYGO_VERSION ?? '0.40.1'
  const arch = process.env.WASM_TINYGO_TINYGO_ARCH ?? defaultArchitectures[process.arch]
  if (!arch) {
    throw new Error(`unsupported TinyGo release architecture for process.arch=${process.arch}`)
  }
  const cacheDir = process.env.WASM_TINYGO_TINYGO_CACHE_DIR ?? path.join(rootDir, '.cache', 'tinygo-toolchain')
  const archiveFileName = `tinygo_${version}_${arch}.deb`
  const archivePath = process.env.WASM_TINYGO_TINYGO_ARCHIVE_PATH ?? path.join(cacheDir, archiveFileName)
  const extractDir = process.env.WASM_TINYGO_TINYGO_EXTRACT_DIR ?? path.join(cacheDir, 'extract')
  const binPath = process.env.WASM_TINYGO_TINYGO_BIN ?? path.join(extractDir, 'usr', 'local', 'bin', 'tinygo')
  const rootPath = process.env.WASM_TINYGO_TINYGOROOT ?? path.join(extractDir, 'usr', 'local', 'lib', 'tinygo')
  const manifestPath = path.join(cacheDir, 'toolchain.json')
  const releaseUrl = process.env.WASM_TINYGO_TINYGO_RELEASE_URL ?? `https://github.com/tinygo-org/tinygo/releases/download/v${version}/${archiveFileName}`

  return {
    archiveFileName,
    archivePath,
    arch,
    binPath,
    cacheDir,
    extractDir,
    manifestPath,
    releaseUrl,
    rootDir,
    rootPath,
    version,
  }
}

export const toolchainIsReady = async (paths) => {
  for (const filePath of [
    paths.binPath,
    path.join(paths.rootPath, 'src', 'runtime', 'internal', 'sys', 'zversion.go'),
    path.join(paths.rootPath, 'src', 'device', 'arm', 'arm.go'),
  ]) {
    try {
      await access(filePath, constants.F_OK)
    } catch {
      return false
    }
  }
  return true
}
