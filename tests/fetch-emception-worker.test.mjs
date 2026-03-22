import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('fetch-emception-worker reuses an existing worker file when download fails', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'wasm-tinygo-fetch-worker-'))
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  const outputPath = path.join(tempDir, 'public', 'vendor', 'emception', 'emception.worker.js')
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, 'existing-worker\n')

  const cwd = new URL('..', import.meta.url).pathname
  const scriptPath = new URL('../scripts/fetch-emception-worker.mjs', import.meta.url).pathname
  const child = spawn(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      WASM_TINYGO_EMCEPTION_WORKER_URL: 'http://127.0.0.1:9/emception.worker.bundle.worker.js',
      WASM_TINYGO_EMCEPTION_OUTPUT_PATH: outputPath,
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
  assert.equal(await readFile(outputPath, 'utf8'), 'existing-worker\n')
})
