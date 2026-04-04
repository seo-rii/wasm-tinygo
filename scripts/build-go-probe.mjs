import { spawnSync } from 'node:child_process'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = process.env.WASM_TINYGO_GO_PROBE_OUTPUT_PATH ?? path.join(rootDir, 'public', 'tools', 'go-probe.wasm')
const compilerOutputPath =
  process.env.WASM_TINYGO_COMPILER_OUTPUT_PATH ?? path.join(rootDir, 'public', 'tools', 'tinygo-compiler.wasm')
const goCachePath = process.env.GOCACHE || path.join(rootDir, '.cache', 'go-build')

await mkdir(path.dirname(outputPath), { recursive: true })
await mkdir(goCachePath, { recursive: true })

const result = spawnSync('go', ['build', '-o', outputPath, './cmd/go-probe'], {
  cwd: rootDir,
  env: {
    ...process.env,
    GOCACHE: goCachePath,
    CGO_ENABLED: '0',
    GOOS: 'wasip1',
    GOARCH: 'wasm',
  },
  stdio: 'inherit',
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log(`Built ${path.relative(rootDir, outputPath)}`)
if (outputPath !== compilerOutputPath) {
  await copyFile(outputPath, compilerOutputPath)
  console.log(`Copied ${path.relative(rootDir, compilerOutputPath)}`)
}
