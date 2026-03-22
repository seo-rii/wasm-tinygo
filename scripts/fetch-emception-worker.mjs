import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchEmceptionWorkerSource } from './patch-emception-worker-source.mjs'

const emceptionWorkerUrl =
  process.env.WASM_TINYGO_EMCEPTION_WORKER_URL ?? 'https://jprendes.github.io/emception/emception.worker.bundle.worker.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath =
  process.env.WASM_TINYGO_EMCEPTION_OUTPUT_PATH ?? path.join(rootDir, 'public', 'vendor', 'emception', 'emception.worker.js')

let sourceText = ''
let reusedExistingWorker = false
try {
  const response = await fetch(emceptionWorkerUrl)
  if (!response.ok) {
    throw new Error(`Failed to download emception worker: ${response.status} ${response.statusText}`)
  }
  sourceText = await response.text()
} catch (error) {
  try {
    await access(outputPath)
    console.warn(
      `Reusing existing emception worker at ${path.relative(rootDir, outputPath)} because download failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    reusedExistingWorker = true
  } catch {
    throw error
  }
}

if (!reusedExistingWorker) {
  const source = patchEmceptionWorkerSource(sourceText)

  const banner = `/* Generated from ${emceptionWorkerUrl} by scripts/fetch-emception-worker.mjs. */\n`

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${banner}${source}`)

  console.log(`Wrote ${path.relative(rootDir, outputPath)}`)
}
