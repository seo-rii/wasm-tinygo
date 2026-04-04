import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ensureTinyGoSourceReady } from './fetch-tinygo-source.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BRIDGE_DIRECTORIES = [
  'internal/driver',
  'internal/tinygobackend',
  'internal/tinygobootstrap',
  'internal/tinygofrontend',
  'internal/tinygoplanner',
  'internal/tinygoroot',
  'internal/tinygotarget',
]

const PROBE_COMMAND_SOURCE = path.join(rootDir, 'cmd', 'go-probe', 'main.go')

const readModulePath = async (sourceRoot) => {
  const goMod = await readFile(path.join(sourceRoot, 'go.mod'), 'utf8')
  const matched = goMod.match(/^module\s+(.+)$/m)
  if (!matched) {
    throw new Error(`TinyGo source at ${sourceRoot} is missing a module declaration`)
  }
  return matched[1].trim()
}

const rewriteImports = (source, modulePath) =>
  source.replaceAll('"wasm-tinygo/internal/', `"${modulePath}/wasmbridge/`)

export const patchTinyGoSourceForWasi = async (sourceRoot) => {
  const modulePath = await readModulePath(sourceRoot)
  const bridgeRoot = path.join(sourceRoot, 'wasmbridge')
  await mkdir(bridgeRoot, { recursive: true })

  for (const directory of BRIDGE_DIRECTORIES) {
    const sourceDir = path.join(rootDir, directory)
    const targetDir = path.join(bridgeRoot, directory.replace(/^internal\//, ''))
    await cp(sourceDir, targetDir, { recursive: true, force: true })
  }

  const copiedFiles = []
  for (const directory of BRIDGE_DIRECTORIES) {
    const targetDir = path.join(bridgeRoot, directory.replace(/^internal\//, ''))
    const stack = [targetDir]
    while (stack.length > 0) {
      const currentDir = stack.pop()
      const names = await readdir(currentDir, { withFileTypes: true })
      for (const entry of names) {
        const entryPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          stack.push(entryPath)
          continue
        }
        if (!entry.isFile() || !entry.name.endsWith('.go')) {
          continue
        }
        const contents = await readFile(entryPath, 'utf8')
        await writeFile(entryPath, rewriteImports(contents, modulePath))
        copiedFiles.push(entryPath)
      }
    }
  }

  const commandDir = path.join(sourceRoot, 'cmd', 'tinygo-wasi')
  await mkdir(commandDir, { recursive: true })
  const commandSource = await readFile(PROBE_COMMAND_SOURCE, 'utf8')
  await writeFile(path.join(commandDir, 'main.go'), rewriteImports(commandSource, modulePath))

  return {
    commandPath: './cmd/tinygo-wasi',
    copiedFileCount: copiedFiles.length + 1,
    modulePath,
    sourceRoot,
  }
}

const run = async () => {
  const source = await ensureTinyGoSourceReady()
  const result = await patchTinyGoSourceForWasi(source.rootPath)
  console.log(`Patched TinyGo source for WASI at ${result.sourceRoot}`)
  console.log(`tinygo wasi command: ${result.commandPath}`)
  console.log(`copied files: ${result.copiedFileCount}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await run()
}
