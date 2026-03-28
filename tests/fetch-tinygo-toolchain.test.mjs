import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('fetch-tinygo-toolchain downloads and extracts a repo-local TinyGo release', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'wasm-tinygo-fetch-toolchain-'))
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  const fakeBinDir = path.join(tempDir, 'bin')
  await mkdir(fakeBinDir, { recursive: true })
  const fakeTarPath = path.join(fakeBinDir, 'tar')
  await writeFile(fakeTarPath, `#!/bin/sh
set -eu
if [ "$1" != "-xzf" ]; then
  echo "unexpected args: $*" >&2
  exit 1
fi
archive="$2"
if [ "$3" != "-C" ]; then
  echo "unexpected args: $*" >&2
  exit 1
fi
dest="$4"
mkdir -p "$dest/tinygo/bin" "$dest/tinygo/src/runtime/internal/sys" "$dest/tinygo/src/device/arm"
printf '#!/bin/sh\nexit 0\n' > "$dest/tinygo/bin/tinygo"
chmod +x "$dest/tinygo/bin/tinygo"
printf 'package sys\n' > "$dest/tinygo/src/runtime/internal/sys/zversion.go"
printf 'package arm\n' > "$dest/tinygo/src/device/arm/arm.go"
printf '%s\n%s\n' "$archive" "$dest" > "$WASM_TINYGO_FAKE_TAR_LOG"
`)
  await chmod(fakeTarPath, 0o755)

  const archiveBody = Buffer.from('fake tinygo archive\n')
  const server = createServer((request, response) => {
    if (request.url === '/tinygo0.40.1.linux-amd64.tar.gz') {
      response.writeHead(200, { 'content-type': 'application/gzip' })
      response.end(archiveBody)
      return
    }
    response.writeHead(404)
    response.end('missing')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('expected an inet server address')
  }

  const cacheDir = path.join(tempDir, '.cache', 'tinygo-toolchain')
  const tarLogPath = path.join(tempDir, 'tar-log.txt')
  const cwd = new URL('..', import.meta.url).pathname
  const scriptPath = new URL('../scripts/fetch-tinygo-toolchain.mjs', import.meta.url).pathname
  const child = spawn(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      WASM_TINYGO_FAKE_TAR_LOG: tarLogPath,
      WASM_TINYGO_TINYGO_CACHE_DIR: cacheDir,
      WASM_TINYGO_TINYGO_RELEASE_URL: `http://127.0.0.1:${address.port}/tinygo0.40.1.linux-amd64.tar.gz`,
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
  const manifest = JSON.parse(await readFile(path.join(cacheDir, 'toolchain.json'), 'utf8'))
  assert.equal(manifest.version, '0.40.1')
  assert.equal(manifest.archiveType, 'tar.gz')
  assert.equal(manifest.archivePath, path.join(cacheDir, 'tinygo0.40.1.linux-amd64.tar.gz'))
  assert.equal(manifest.binPath, path.join(cacheDir, 'extract', 'tinygo', 'bin', 'tinygo'))
  assert.equal(manifest.rootPath, path.join(cacheDir, 'extract', 'tinygo'))
  const [archivePath, extractPath] = (await readFile(tarLogPath, 'utf8')).trimEnd().split('\n')
  assert.equal(archivePath, manifest.archivePath)
  assert.equal(extractPath, path.join(cacheDir, 'extract'))
  assert.equal(await readFile(manifest.archivePath, 'utf8'), archiveBody.toString())
})

test('fetch-tinygo-toolchain reports a clear error when the archive extractor is unavailable', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'wasm-tinygo-fetch-toolchain-missing-extractor-'))
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  const cacheDir = path.join(tempDir, '.cache', 'tinygo-toolchain')
  const archivePath = path.join(cacheDir, 'tinygo0.40.1.linux-amd64.tar.gz')
  await mkdir(cacheDir, { recursive: true })
  await writeFile(archivePath, 'fake tinygo archive\n')

  const emptyPathDir = path.join(tempDir, 'empty-bin')
  await mkdir(emptyPathDir, { recursive: true })

  const cwd = new URL('..', import.meta.url).pathname
  const scriptPath = new URL('../scripts/fetch-tinygo-toolchain.mjs', import.meta.url).pathname
  const child = spawn(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      PATH: emptyPathDir,
      WASM_TINYGO_TINYGO_ARCHIVE_PATH: archivePath,
      WASM_TINYGO_TINYGO_CACHE_DIR: cacheDir,
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

  assert.notEqual(exitCode, 0, output)
  assert.match(output, /TinyGo archive extraction failed: tar is not available/)
})
