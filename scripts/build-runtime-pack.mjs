import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const THIS_FILE = fileURLToPath(import.meta.url)
const ROOT_DIR = path.resolve(path.dirname(THIS_FILE), '..')
const PUBLIC_DIR =
  process.env.WASM_TINYGO_RUNTIME_PACK_ROOT ?? path.join(ROOT_DIR, 'public')
const OUTPUT_DIR =
  process.env.WASM_TINYGO_RUNTIME_PACK_OUTPUT ??
  path.join(PUBLIC_DIR, 'runtime-pack')

const normalizePath = (value) => value.split(path.sep).join('/')

const collectFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)))
      continue
    }
    if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

const buildPack = async () => {
  const packEntries = []
  const publicAssets = []
  const toolProbePath = path.join(PUBLIC_DIR, 'tools', 'go-probe.wasm')
  try {
    await fs.access(toolProbePath)
    publicAssets.push(toolProbePath)
  } catch {}

  const emceptionDir = path.join(PUBLIC_DIR, 'vendor', 'emception')
  try {
    await fs.access(emceptionDir)
    publicAssets.push(...(await collectFiles(emceptionDir)))
  } catch {}

  if (!publicAssets.length) {
    throw new Error(`no runtime assets found under ${PUBLIC_DIR}`)
  }

  const sortedAssets = publicAssets
    .map((filePath) => ({
      filePath,
      runtimePath: normalizePath(path.relative(PUBLIC_DIR, filePath)),
    }))
    .sort((a, b) => a.runtimePath.localeCompare(b.runtimePath))

  let offset = 0
  const chunks = []
  for (const asset of sortedAssets) {
    const bytes = await fs.readFile(asset.filePath)
    chunks.push(bytes)
    packEntries.push({
      runtimePath: asset.runtimePath,
      offset,
      length: bytes.length,
    })
    offset += bytes.length
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const packBinaryPath = path.join(OUTPUT_DIR, 'runtime-pack.bin')
  const packIndexPath = path.join(OUTPUT_DIR, 'runtime-pack.index.json')
  await fs.writeFile(packBinaryPath, Buffer.concat(chunks))
  await fs.writeFile(
    packIndexPath,
    JSON.stringify(
      {
        format: 'wasm-tinygo-runtime-pack-index-v1',
        fileCount: packEntries.length,
        totalBytes: offset,
        entries: packEntries,
      },
      null,
      2,
    ),
  )
  return {
    outputDir: OUTPUT_DIR,
    packIndexPath,
    packBinaryPath,
    fileCount: packEntries.length,
    totalBytes: offset,
  }
}

const result = await buildPack()
process.stdout.write(
  `built wasm-tinygo runtime pack at ${path.relative(ROOT_DIR, result.outputDir)} (${result.fileCount} files, ${result.totalBytes} bytes)\n`,
)
