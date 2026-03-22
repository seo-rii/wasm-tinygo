import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI, WASIProcExit } from '@bjorn3/browser_wasi_shim'

const wasmBytes = readFileSync(new URL('../public/tools/go-probe.wasm', import.meta.url))
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const buildDirectoryContents = (entries) => {
  const root = new Map()
  for (const [path, contents] of Object.entries(entries)) {
    const parts = path.split('/')
    let currentDirectory = root
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1) {
        currentDirectory.set(part, new File(textEncoder.encode(contents)))
        continue
      }
      const existing = currentDirectory.get(part)
      if (existing instanceof Directory) {
        currentDirectory = existing.contents
        continue
      }
      const directory = new Directory(new Map())
      currentDirectory.set(part, directory)
      currentDirectory = directory.contents
    }
  }
  return root
}

const runProbe = async ({ mode, rootPath, entries, resultFileName }) => {
  const logs = []
  const rootDirectory = new PreopenDirectory(rootPath, buildDirectoryContents(entries))
  const stdout = ConsoleStdout.lineBuffered((line) => logs.push(`stdout ${line}`))
  const stderr = ConsoleStdout.lineBuffered((line) => logs.push(`stderr ${line}`))
  const wasi = new WASI(['tinygo-driver'], [`WASM_TINYGO_MODE=${mode}`], [new OpenFile(new File([])), stdout, stderr, rootDirectory])
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

  const resultNode = rootDirectory.dir.contents.get(resultFileName)
  const compileRequestNode = rootDirectory.dir.contents.get('tinygo-compile-request.json')
  const result = resultNode ? JSON.parse(textDecoder.decode(resultNode.data)) : null
  const compileRequest = compileRequestNode ? JSON.parse(textDecoder.decode(compileRequestNode.data)) : null
  return { exitCode, result, compileRequest, logs }
}

const runDriver = async ({ source, files, request }) => runProbe({
  mode: 'driver',
  rootPath: '/workspace',
  entries: {
    'tinygo-request.json': JSON.stringify(request),
    ...(files ?? { 'main.go': source }),
  },
  resultFileName: 'tinygo-result.json',
})

const runFrontend = async ({ input, files }) => runProbe({
  mode: 'frontend',
  rootPath: '/working',
  entries: {
    'tinygo-frontend-input.json': JSON.stringify(input),
    ...(files ?? {}),
  },
  resultFileName: 'tinygo-frontend-result.json',
})

const runBackend = async ({ input, files }) => runProbe({
  mode: 'backend',
  rootPath: '/working',
  entries: {
    'tinygo-backend-input.json': JSON.stringify(input),
    ...(files ?? {}),
  },
  resultFileName: 'tinygo-backend-result.json',
})

test('wasi driver writes tinygo metadata for valid source', async () => {
  const execution = await runDriver({
    source: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("ok") }\n',
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
      optimize: 'z',
      scheduler: 'tasks',
      panic: 'trap',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.equal(execution.result.mode, 'tinygo-bootstrap')
  assert.equal(execution.result.metadata.llvmTarget, 'wasm32-unknown-wasi')
  assert.equal(execution.result.metadata.scheduler, 'tasks')
  assert.equal(execution.result.metadata.panicStrategy, 'trap')
  assert.ok(execution.result.metadata.buildTags.includes('tinygo.wasm'))
  const manifestFile = execution.result.files.find((file) => file.path === '/working/tinygo-bootstrap.json')
  const frontendInputFile = execution.result.files.find((file) => file.path === '/working/tinygo-frontend-input.json')
  assert.ok(manifestFile)
  assert.ok(frontendInputFile)
  const manifest = JSON.parse(manifestFile.contents)
  const frontendInput = JSON.parse(frontendInputFile.contents)
  const generatedPaths = execution.result.files.map((file) => file.path)
  assert.ok(generatedPaths.includes('/working/tinygo-bootstrap.json'))
  assert.ok(generatedPaths.includes('/working/tinygo-frontend-input.json'))
  assert.ok(generatedPaths.includes('/working/.tinygo-root/targets/wasm.json'))
  assert.ok(generatedPaths.includes('/working/.tinygo-root/src/errors/errors.go'))
  assert.ok(generatedPaths.includes('/working/.tinygo-root/src/fmt/print.go'))
  assert.ok(generatedPaths.includes('/working/.tinygo-root/src/io/io.go'))
  assert.ok(generatedPaths.includes('/working/.tinygo-root/src/runtime/runtime.go'))
  assert.ok(generatedPaths.includes('/working/.tinygo-root/src/unsafe/unsafe.go'))
  assert.ok(!generatedPaths.includes('/working/.tinygo-root/targets/wasip1.json'))
  assert.equal(manifest.tinygoRoot, undefined)
  assert.equal(manifest.entryPath, undefined)
  assert.equal(manifest.modulePath, undefined)
  assert.equal(manifest.packageFiles, undefined)
  assert.equal(manifest.importedPackageFiles, undefined)
  assert.equal(manifest.imports, undefined)
  assert.equal(manifest.stdlibImports, undefined)
  assert.equal(manifest.stdlibPackageFiles, undefined)
  assert.equal(manifest.buildTags, undefined)
  assert.equal(manifest.target, undefined)
  assert.equal(manifest.scheduler, undefined)
  assert.equal(manifest.panicStrategy, undefined)
  assert.equal(manifest.optimizeFlag, undefined)
  assert.equal(manifest.compileInputs.entryFile, '/workspace/main.go')
  assert.deepEqual(manifest.compileInputs.packageFiles, ['/workspace/main.go'])
  assert.deepEqual(manifest.compileInputs.importedPackageFiles, [])
  assert.deepEqual(manifest.compileInputs.stdlibPackageFiles, [
    '/working/.tinygo-root/src/errors/errors.go',
    '/working/.tinygo-root/src/fmt/print.go',
    '/working/.tinygo-root/src/io/io.go',
    '/working/.tinygo-root/src/runtime/runtime.go',
    '/working/.tinygo-root/src/unsafe/unsafe.go',
  ])
  assert.equal(manifest.bootstrapExports, undefined)
  assert.deepEqual(manifest.bootstrapDispatch, {
    targetAssetFiles: [
      '/working/.tinygo-root/targets/wasm-undefined.txt',
      '/working/.tinygo-root/targets/wasm.json',
    ],
    runtimeSupportFiles: [
      '/working/.tinygo-root/src/device/arm/arm.go',
      '/working/.tinygo-root/src/runtime/asm_tinygowasm.S',
      '/working/.tinygo-root/src/runtime/gc_boehm.c',
      '/working/.tinygo-root/src/runtime/internal/sys/zversion.go',
    ],
    materializedFiles: [
      '/working/.tinygo-root/src/device/arm/arm.go',
      '/working/.tinygo-root/src/errors/errors.go',
      '/working/.tinygo-root/src/fmt/print.go',
      '/working/.tinygo-root/src/io/io.go',
      '/working/.tinygo-root/src/runtime/asm_tinygowasm.S',
      '/working/.tinygo-root/src/runtime/gc_boehm.c',
      '/working/.tinygo-root/src/runtime/internal/sys/zversion.go',
      '/working/.tinygo-root/src/runtime/runtime.go',
      '/working/.tinygo-root/src/unsafe/unsafe.go',
      '/working/.tinygo-root/targets/wasm-undefined.txt',
      '/working/.tinygo-root/targets/wasm.json',
      '/working/tinygo-bootstrap.json',
      '/working/tinygo-frontend-input.json',
    ],
  })
  assert.equal(frontendInput.tinygoRoot, undefined)
  assert.equal(frontendInput.target, undefined)
  assert.equal(frontendInput.llvmTarget, undefined)
  assert.equal(frontendInput.linker, undefined)
  assert.equal(frontendInput.translationUnitPath, undefined)
  assert.equal(frontendInput.objectOutputPath, undefined)
  assert.equal(frontendInput.artifactOutputPath, undefined)
  assert.deepEqual(frontendInput.toolchain, {
    target: 'wasm',
    artifactOutputPath: '/working/out.wasm',
  })
  assert.equal(frontendInput.packageFiles, undefined)
  assert.equal(frontendInput.targetAssetFiles, undefined)
  assert.equal(frontendInput.runtimeSupportFiles, undefined)
  assert.equal(frontendInput.programFiles, undefined)
  assert.equal(frontendInput.importedPackageFiles, undefined)
  assert.equal(frontendInput.stdlibPackageFiles, undefined)
  assert.equal(frontendInput.allCompileFiles, undefined)
  assert.equal(frontendInput.sourceSelection.targetAssets, undefined)
  assert.equal(frontendInput.sourceSelection.runtimeSupport, undefined)
  assert.equal(frontendInput.sourceSelection.program, undefined)
  assert.equal(frontendInput.sourceSelection.imported, undefined)
  assert.equal(frontendInput.sourceSelection.stdlib, undefined)
  assert.deepEqual(frontendInput.sourceSelection.allCompile, [
    '/working/.tinygo-root/src/errors/errors.go',
    '/working/.tinygo-root/src/fmt/print.go',
    '/working/.tinygo-root/src/io/io.go',
    '/working/.tinygo-root/src/runtime/runtime.go',
    '/working/.tinygo-root/src/unsafe/unsafe.go',
    '/workspace/main.go',
  ])
  assert.equal(frontendInput.scheduler, undefined)
  assert.equal(frontendInput.panicStrategy, undefined)
  assert.equal(frontendInput.modulePath, undefined)
  assert.equal(frontendInput.imports, undefined)
  assert.equal(frontendInput.buildTags, undefined)
  assert.equal(frontendInput.materializedFiles, undefined)
  assert.ok(!generatedPaths.includes('/working/tinygo-bootstrap.c'))
})

test('wasi driver writes diagnostics for invalid source', async () => {
  const execution = await runDriver({
    source: 'package main\n\nfunc helper() {}\n',
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 1)
  assert.equal(execution.result.ok, false)
  assert.match(execution.result.diagnostics[0], /func main/)
})

test('wasi driver supports wasip1 metadata', async () => {
  const execution = await runDriver({
    source: 'package main\n\nfunc main() {}\n',
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasip1',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.equal(execution.result.metadata.goos, 'wasip1')
  assert.equal(execution.result.metadata.llvmTarget, 'wasm32-unknown-wasi')
  const generatedPaths = execution.result.files.map((file) => file.path)
  assert.ok(generatedPaths.includes('/working/.tinygo-root/targets/wasip1.json'))
  assert.ok(!generatedPaths.includes('/working/.tinygo-root/targets/wasm.json'))
})

test('wasi driver honors go:build constraints when loading package files', async () => {
  const execution = await runDriver({
    files: {
      'main.go': 'package main\n\nfunc main() { browserOnly() }\n',
      'browser.go': '//go:build tinygo.wasm && scheduler.tasks\n\npackage main\n\nfunc browserOnly() {}\n',
      'wasip1_only.go': '//go:build wasip1\n\npackage broken\n',
      'not_wasm.go': '//go:build !tinygo.wasm\n\npackage broken\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
      scheduler: 'tasks',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.deepEqual(execution.result.metadata.packageFiles, [
    '/workspace/browser.go',
    '/workspace/main.go',
  ])
})

test('wasi driver honors filename target suffixes when loading package files', async () => {
  const execution = await runDriver({
    files: {
      'main.go': 'package main\n\nfunc main() { browserOnly(); archOnly() }\n',
      'browser_js.go': 'package main\n\nfunc browserOnly() {}\n',
      'arch_wasm.go': 'package main\n\nfunc archOnly() {}\n',
      'host_wasip1.go': 'package broken\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.deepEqual(execution.result.metadata.packageFiles, [
    '/workspace/arch_wasm.go',
    '/workspace/browser_js.go',
    '/workspace/main.go',
  ])
})

test('wasi driver writes diagnostics for unresolved external imports', async () => {
  const execution = await runDriver({
    source: 'package main\n\nimport "example.com/lib"\n\nfunc main() { lib.Run() }\n',
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 1)
  assert.equal(execution.result.ok, false)
  assert.match(execution.result.diagnostics[0], /module resolution/)
})

test('wasi driver tracks current-module imports when go.mod is present', async () => {
  const execution = await runDriver({
    files: {
      'go.mod': 'module example.com/app\n\ngo 1.24\n',
      'main.go': 'package main\n\nimport "example.com/app/internal/helper"\n\nfunc main() { helper.Run() }\n',
      'internal/helper/helper.go': 'package helper\n\nimport "example.com/app/internal/deep"\n\nfunc Run() { deep.Call() }\n',
      'internal/deep/deep.go': 'package deep\n\nfunc Call() {}\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.equal(execution.result.metadata.modulePath, 'example.com/app')
  assert.deepEqual(execution.result.metadata.localModuleImports, [
    'example.com/app/internal/deep',
    'example.com/app/internal/helper',
  ])
  assert.deepEqual(execution.result.metadata.importedPackageFiles, [
    '/workspace/internal/deep/deep.go',
    '/workspace/internal/helper/helper.go',
  ])
})

test('wasi driver tracks local replace module imports', async () => {
  const execution = await runDriver({
    files: {
      'go.mod': 'module example.com/app\n\ngo 1.24\n\nreplace example.com/lib => ./third_party/lib\n',
      'main.go': 'package main\n\nimport "example.com/lib/pkg"\n\nfunc main() { pkg.Run() }\n',
      'third_party/lib/pkg/pkg.go': 'package pkg\n\nfunc Run() {}\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.deepEqual(execution.result.metadata.replacedModuleImports, [
    'example.com/lib/pkg',
  ])
  assert.deepEqual(execution.result.metadata.importedPackageFiles, [
    '/workspace/third_party/lib/pkg/pkg.go',
  ])
})

test('wasi driver tracks workspace module imports from go.work', async () => {
  const execution = await runDriver({
    files: {
      'go.work': 'go 1.24\n\nuse (\n\t./app\n\t./libs/lib\n)\n',
      'app/go.mod': 'module example.com/app\n\ngo 1.24\n',
      'app/main.go': 'package main\n\nimport "example.com/lib/pkg"\n\nfunc main() { pkg.Run() }\n',
      'libs/lib/go.mod': 'module example.com/lib\n\ngo 1.24\n',
      'libs/lib/pkg/pkg.go': 'package pkg\n\nfunc Run() {}\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/app/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.deepEqual(execution.result.metadata.workspaceModuleImports, [
    'example.com/lib/pkg',
  ])
  assert.deepEqual(execution.result.metadata.importedPackageFiles, [
    '/workspace/libs/lib/pkg/pkg.go',
  ])
})

test('wasi driver tracks workspace module replace imports', async () => {
  const execution = await runDriver({
    files: {
      'go.work': 'go 1.24\n\nuse (\n\t./app\n\t./libs/lib\n)\n',
      'app/go.mod': 'module example.com/app\n\ngo 1.24\n',
      'app/main.go': 'package main\n\nimport "example.com/lib/pkg"\n\nfunc main() { pkg.Run() }\n',
      'libs/lib/go.mod': 'module example.com/lib\n\ngo 1.24\n\nreplace example.com/dep => ../../shared/dep\n',
      'libs/lib/pkg/pkg.go': 'package pkg\n\nimport "example.com/dep/value"\n\nfunc Run() { value.Call() }\n',
      'shared/dep/go.mod': 'module example.com/dep\n\ngo 1.24\n',
      'shared/dep/value/value.go': 'package value\n\nfunc Call() {}\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/app/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.deepEqual(execution.result.metadata.workspaceModuleImports, [
    'example.com/lib/pkg',
  ])
  assert.deepEqual(execution.result.metadata.replacedModuleImports, [
    'example.com/dep/value',
  ])
  assert.deepEqual(execution.result.metadata.importedPackageFiles, [
    '/workspace/libs/lib/pkg/pkg.go',
    '/workspace/shared/dep/value/value.go',
  ])
})

test('wasi driver tracks go.work replace module imports', async () => {
  const execution = await runDriver({
    files: {
      'go.work': 'go 1.24\n\nuse ./app\n\nreplace example.com/lib => ./shared/lib\n',
      'app/go.mod': 'module example.com/app\n\ngo 1.24\n',
      'app/main.go': 'package main\n\nimport "example.com/lib/pkg"\n\nfunc main() { pkg.Run() }\n',
      'shared/lib/go.mod': 'module example.com/lib\n\ngo 1.24\n',
      'shared/lib/pkg/pkg.go': 'package pkg\n\nfunc Run() {}\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/app/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.deepEqual(execution.result.metadata.workspaceModuleImports, [])
  assert.deepEqual(execution.result.metadata.replacedModuleImports, [
    'example.com/lib/pkg',
  ])
  assert.deepEqual(execution.result.metadata.importedPackageFiles, [
    '/workspace/shared/lib/pkg/pkg.go',
  ])
})

test('wasi driver writes diagnostics for non-local go.work replace directives', async () => {
  const execution = await runDriver({
    files: {
      'go.work': 'go 1.24\n\nuse ./app\n\nreplace example.com/lib => example.com/lib v1.2.3\n',
      'app/go.mod': 'module example.com/app\n\ngo 1.24\n',
      'app/main.go': 'package main\n\nimport "example.com/lib/pkg"\n\nfunc main() { pkg.Run() }\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/app/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 1)
  assert.equal(execution.result.ok, false)
  assert.match(execution.result.diagnostics[0], /non-local replace directive is not supported yet/)
})

test('wasi driver writes diagnostics for current-module import cycles', async () => {
  const execution = await runDriver({
    files: {
      'go.mod': 'module example.com/app\n\ngo 1.24\n',
      'main.go': 'package main\n\nimport "example.com/app/internal/helper"\n\nfunc main() { helper.Run() }\n',
      'internal/helper/helper.go': 'package helper\n\nimport "example.com/app/internal/deep"\n\nfunc Run() { deep.Call() }\n',
      'internal/deep/deep.go': 'package deep\n\nimport "example.com/app/internal/helper"\n\nfunc Call() { helper.Run() }\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 1)
  assert.equal(execution.result.ok, false)
  assert.match(execution.result.diagnostics[0], /import cycle/)
})

test('wasi driver writes diagnostics when a local package is excluded by target constraints', async () => {
  const execution = await runDriver({
    files: {
      'go.mod': 'module example.com/app\n\ngo 1.24\n',
      'main.go': 'package main\n\nimport "example.com/app/internal/helper"\n\nfunc main() { helper.Run() }\n',
      'internal/helper/helper_wasip1.go': 'package helper\n\nfunc Run() {}\n',
    },
    request: {
      command: 'build',
      planner: 'tinygo',
      entry: '/workspace/main.go',
      output: '/working/out.wasm',
      target: 'wasm',
    },
  })

  assert.equal(execution.exitCode, 1)
  assert.equal(execution.result.ok, false)
  assert.match(execution.result.diagnostics[0], /no files matching current target\/build constraints/)
})

test('wasi frontend consumes bootstrap handoff input', async () => {
  const execution = await runFrontend({
    input: {
      toolchain: {
        target: 'wasm',
        artifactOutputPath: '/working/out.wasm',
      },
      optimizeFlag: '-Oz',
      entryFile: '/workspace/main.go',
      sourceSelection: {
        program: ['/workspace/main.go'],
        allCompile: [
          '/working/.tinygo-root/src/errors/errors.go',
          '/working/.tinygo-root/src/fmt/print.go',
          '/workspace/main.go',
        ],
      },
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.equal(execution.result.mode, undefined)
  assert.equal(execution.result.entryFile, undefined)
  assert.equal(execution.result.target, undefined)
  assert.equal(execution.result.compileRequestPath, undefined)
  assert.equal(execution.result.bootstrapArtifact, undefined)
  assert.equal(execution.result.generatedFiles.length, 7)
  assert.deepEqual(execution.result.generatedFiles, [
    {
      path: '/working/tinygo-bootstrap.c',
      contents: execution.result.generatedFiles[0].contents,
    },
    {
      path: '/working/tinygo-compile-unit.json',
      contents: execution.result.generatedFiles[1].contents,
    },
    {
      path: '/working/tinygo-intermediate.json',
      contents: execution.result.generatedFiles[2].contents,
    },
    {
      path: '/working/tinygo-lowering-input.json',
      contents: execution.result.generatedFiles[3].contents,
    },
    {
      path: '/working/tinygo-work-items.json',
      contents: execution.result.generatedFiles[4].contents,
    },
    {
      path: '/working/tinygo-lowering-plan.json',
      contents: execution.result.generatedFiles[5].contents,
    },
    {
      path: '/working/tinygo-backend-input.json',
      contents: execution.result.generatedFiles[6].contents,
    },
  ])
  assert.equal(execution.result.generatedFiles[0].contents.includes('module: '), false)
  assert.match(execution.result.generatedFiles[0].contents, /\\"materializedFiles\\":\[\\"\/working\/\.tinygo-root\/src\/device\/arm\/arm\.go\\"/)
  assert.match(execution.result.generatedFiles[1].contents, /"entryFile":"\/workspace\/main.go"/)
  assert.match(execution.result.generatedFiles[1].contents, /"toolchain":\{"target":"wasm","artifactOutputPath":"\/working\/out\.wasm"\}/)
  assert.match(execution.result.generatedFiles[1].contents, /"sourceSelection":\{"allCompile":\["\/working\/\.tinygo-root\/src\/errors\/errors\.go","\/working\/\.tinygo-root\/src\/fmt\/print\.go","\/workspace\/main\.go"\]\}/)
  assert.match(execution.result.generatedFiles[1].contents, /"materializedFiles":\["\/working\/\.tinygo-root\/src\/device\/arm\/arm\.go"/)
  assert.equal(execution.result.generatedFiles[0].contents.includes('/working/tinygo-bootstrap.json'), false)
  assert.equal(execution.result.generatedFiles[0].contents.includes('/working/tinygo-frontend-input.json'), false)
  assert.equal(execution.result.generatedFiles[1].contents.includes('/working/tinygo-bootstrap.json'), false)
  assert.equal(execution.result.generatedFiles[1].contents.includes('/working/tinygo-frontend-input.json'), false)
  const intermediateManifest = JSON.parse(execution.result.generatedFiles[2].contents)
  assert.equal(intermediateManifest.entryFile, '/workspace/main.go')
  assert.deepEqual(intermediateManifest.sourceSelection.program, ['/workspace/main.go'])
  assert.deepEqual(intermediateManifest.sourceSelection.imported, [])
  assert.deepEqual(intermediateManifest.sourceSelection.stdlib, [
    '/working/.tinygo-root/src/errors/errors.go',
    '/working/.tinygo-root/src/fmt/print.go',
  ])
  assert.deepEqual(intermediateManifest.sourceSelection.targetAssets, [
    '/working/.tinygo-root/targets/wasm-undefined.txt',
    '/working/.tinygo-root/targets/wasm.json',
  ])
  assert.deepEqual(intermediateManifest.toolchain, {
    target: 'wasm',
    llvmTarget: 'wasm32-unknown-wasi',
    linker: 'wasm-ld',
    cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
    ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
    translationUnitPath: '/working/tinygo-bootstrap.c',
    objectOutputPath: '/working/tinygo-bootstrap.o',
    artifactOutputPath: '/working/out.wasm',
  })
  assert.deepEqual(intermediateManifest.compileUnits, [
    {
      kind: 'program',
      packageDir: '/workspace',
      files: ['/workspace/main.go'],
    },
    {
      kind: 'stdlib',
      packageDir: '/working/.tinygo-root/src/errors',
      files: ['/working/.tinygo-root/src/errors/errors.go'],
    },
    {
      kind: 'stdlib',
      packageDir: '/working/.tinygo-root/src/fmt',
      files: ['/working/.tinygo-root/src/fmt/print.go'],
    },
  ])
  const loweringManifest = JSON.parse(execution.result.generatedFiles[3].contents)
  assert.deepEqual(loweringManifest.support, {
    targetAssets: [
      '/working/.tinygo-root/targets/wasm-undefined.txt',
      '/working/.tinygo-root/targets/wasm.json',
    ],
    runtimeSupport: [
      '/working/.tinygo-root/src/device/arm/arm.go',
      '/working/.tinygo-root/src/runtime/asm_tinygowasm.S',
      '/working/.tinygo-root/src/runtime/gc_boehm.c',
      '/working/.tinygo-root/src/runtime/internal/sys/zversion.go',
    ],
  })
  assert.deepEqual(loweringManifest.compileUnits, intermediateManifest.compileUnits)
  const workItemsManifest = JSON.parse(execution.result.generatedFiles[4].contents)
  assert.deepEqual(workItemsManifest.workItems, [
    {
      id: 'program-000',
      kind: 'program',
      packageDir: '/workspace',
      files: ['/workspace/main.go'],
      bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
    },
    {
      id: 'stdlib-000',
      kind: 'stdlib',
      packageDir: '/working/.tinygo-root/src/errors',
      files: ['/working/.tinygo-root/src/errors/errors.go'],
      bitcodeOutputPath: '/working/tinygo-work/stdlib-000.bc',
    },
    {
      id: 'stdlib-001',
      kind: 'stdlib',
      packageDir: '/working/.tinygo-root/src/fmt',
      files: ['/working/.tinygo-root/src/fmt/print.go'],
      bitcodeOutputPath: '/working/tinygo-work/stdlib-001.bc',
    },
  ])
  const loweringPlanManifest = JSON.parse(execution.result.generatedFiles[5].contents)
  assert.deepEqual(loweringPlanManifest.compileJobs, [
    {
      id: 'program-000',
      kind: 'program',
      packageDir: '/workspace',
      files: ['/workspace/main.go'],
      bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
      llvmTarget: 'wasm32-unknown-wasi',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      optimizeFlag: '-Oz',
    },
    {
      id: 'stdlib-000',
      kind: 'stdlib',
      packageDir: '/working/.tinygo-root/src/errors',
      files: ['/working/.tinygo-root/src/errors/errors.go'],
      bitcodeOutputPath: '/working/tinygo-work/stdlib-000.bc',
      llvmTarget: 'wasm32-unknown-wasi',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      optimizeFlag: '-Oz',
    },
    {
      id: 'stdlib-001',
      kind: 'stdlib',
      packageDir: '/working/.tinygo-root/src/fmt',
      files: ['/working/.tinygo-root/src/fmt/print.go'],
      bitcodeOutputPath: '/working/tinygo-work/stdlib-001.bc',
      llvmTarget: 'wasm32-unknown-wasi',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      optimizeFlag: '-Oz',
    },
  ])
  assert.deepEqual(loweringPlanManifest.linkJob, {
    linker: 'wasm-ld',
    ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
    artifactOutputPath: '/working/out.wasm',
    bitcodeInputs: [
      '/working/tinygo-work/program-000.bc',
      '/working/tinygo-work/stdlib-000.bc',
      '/working/tinygo-work/stdlib-001.bc',
    ],
  })
  const backendInputManifest = JSON.parse(execution.result.generatedFiles[6].contents)
  assert.equal(backendInputManifest.entryFile, '/workspace/main.go')
  assert.deepEqual(backendInputManifest.compileJobs, loweringPlanManifest.compileJobs)
  assert.deepEqual(backendInputManifest.linkJob, {
    linker: loweringPlanManifest.linkJob.linker,
    ldflags: loweringPlanManifest.linkJob.ldflags,
    artifactOutputPath: loweringPlanManifest.linkJob.artifactOutputPath,
  })
  assert.equal(backendInputManifest.loweredUnits, undefined)
  assert.equal(backendInputManifest.linkJob.bitcodeInputs, undefined)
  const compileUnitManifest = JSON.parse(execution.result.generatedFiles[1].contents)
  assert.equal(compileUnitManifest.target, undefined)
  assert.equal(compileUnitManifest.llvmTarget, undefined)
  assert.equal(compileUnitManifest.linker, undefined)
  assert.equal(compileUnitManifest.modulePath, undefined)
  assert.equal(compileUnitManifest.imports, undefined)
  assert.equal(compileUnitManifest.buildTags, undefined)
  assert.equal(compileUnitManifest.translationUnitPath, undefined)
  assert.equal(compileUnitManifest.objectOutputPath, undefined)
  assert.equal(compileUnitManifest.artifactOutputPath, undefined)
  assert.equal(compileUnitManifest.packageFiles, undefined)
  assert.equal(compileUnitManifest.importedPackageFiles, undefined)
  assert.equal(compileUnitManifest.stdlibPackageFiles, undefined)
  assert.equal(compileUnitManifest.allFiles, undefined)
  assert.equal(compileUnitManifest.allCompileFiles, undefined)
  assert.equal(compileUnitManifest.targetAssetFiles, undefined)
  assert.equal(compileUnitManifest.runtimeSupportFiles, undefined)
  assert.equal(compileUnitManifest.sourceSelection.targetAssets, undefined)
  assert.equal(compileUnitManifest.sourceSelection.runtimeSupport, undefined)
  assert.equal(compileUnitManifest.programFiles, undefined)
  assert.equal(compileUnitManifest.packageFileCount, undefined)
  assert.equal(compileUnitManifest.importedPackageFileCount, undefined)
  assert.equal(compileUnitManifest.stdlibPackageFileCount, undefined)
  assert.equal(compileUnitManifest.allFileCount, undefined)
  assert.equal(compileUnitManifest.targetAssetCount, undefined)
  assert.equal(compileUnitManifest.runtimeSupportFileCount, undefined)
  assert.equal(compileUnitManifest.programFileCount, undefined)
  assert.equal(compileUnitManifest.materializedFileCount, undefined)
  assert.equal(execution.result.compileRequest, undefined)
  assert.equal(execution.result.compileGroups, undefined)
  assert.equal(execution.result.summary, undefined)
  assert.equal(execution.compileRequest, null)
  assert.match(execution.result.diagnostics[0], /frontend prepared 6 compile groups/)
})

test('wasi backend consumes backend input', async () => {
  const execution = await runBackend({
    input: {
      entryFile: '/workspace/main.go',
      optimizeFlag: '-Oz',
      compileJobs: [
        {
          id: 'program-000',
          kind: 'program',
          packageDir: '/workspace',
          files: ['/workspace/main.go'],
          bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
          llvmTarget: 'wasm32-unknown-wasi',
          cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
          optimizeFlag: '-Oz',
        },
        {
          id: 'stdlib-000',
          kind: 'stdlib',
          packageDir: '/working/.tinygo-root/src/errors',
          files: ['/working/.tinygo-root/src/errors/errors.go'],
          bitcodeOutputPath: '/working/tinygo-work/stdlib-000.bc',
          llvmTarget: 'wasm32-unknown-wasi',
          cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
          optimizeFlag: '-Oz',
        },
      ],
      linkJob: {
        linker: 'wasm-ld',
        ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
        artifactOutputPath: '/working/out.wasm',
      },
    },
  })

  assert.equal(execution.exitCode, 0)
  assert.equal(execution.result.ok, true)
  assert.equal(execution.result.generatedFiles.length, 9)
  assert.deepEqual(execution.result.generatedFiles, [
    {
      path: '/working/tinygo-lowered-sources.json',
      contents: execution.result.generatedFiles[0].contents,
    },
    {
      path: '/working/tinygo-lowered-bitcode.json',
      contents: execution.result.generatedFiles[1].contents,
    },
    {
      path: '/working/tinygo-lowered/program-000.c',
      contents: execution.result.generatedFiles[2].contents,
    },
    {
      path: '/working/tinygo-lowered/stdlib-000.c',
      contents: execution.result.generatedFiles[3].contents,
    },
    {
      path: '/working/tinygo-lowered-ir.json',
      contents: execution.result.generatedFiles[4].contents,
    },
    {
      path: '/working/tinygo-lowered-command-batch.json',
      contents: execution.result.generatedFiles[5].contents,
    },
    {
      path: '/working/tinygo-lowered-artifact.json',
      contents: execution.result.generatedFiles[6].contents,
    },
    {
      path: '/working/tinygo-command-artifact.json',
      contents: execution.result.generatedFiles[7].contents,
    },
    {
      path: '/working/tinygo-command-batch.json',
      contents: execution.result.generatedFiles[8].contents,
    },
  ])
  const loweredSourcesManifest = JSON.parse(execution.result.generatedFiles[0].contents)
  assert.deepEqual(loweredSourcesManifest.units, [
    {
      id: 'program-000',
      kind: 'program',
      packageDir: '/workspace',
      sourceFiles: ['/workspace/main.go'],
      loweredSourcePath: '/working/tinygo-lowered/program-000.c',
    },
    {
      id: 'stdlib-000',
      kind: 'stdlib',
      packageDir: '/working/.tinygo-root/src/errors',
      sourceFiles: ['/working/.tinygo-root/src/errors/errors.go'],
      loweredSourcePath: '/working/tinygo-lowered/stdlib-000.c',
    },
  ])
  const loweredBitcodeManifest = JSON.parse(execution.result.generatedFiles[1].contents)
  assert.deepEqual(loweredBitcodeManifest.bitcodeFiles, [
    '/working/tinygo-work/program-000.bc',
    '/working/tinygo-work/stdlib-000.bc',
  ])
  assert.match(execution.result.generatedFiles[2].contents, /tinygo_lowered_program_000_id/)
  assert.match(execution.result.generatedFiles[3].contents, /tinygo_lowered_stdlib_000_kind_tag/)
  const loweredIRManifest = JSON.parse(execution.result.generatedFiles[4].contents)
  assert.deepEqual(loweredIRManifest.units, [
    {
      id: 'program-000',
      kind: 'program',
      packageDir: '/workspace',
      sourceFiles: ['/workspace/main.go'],
      loweredSourcePath: '/working/tinygo-lowered/program-000.c',
      packageName: '',
      imports: [],
      functions: [],
      types: [],
      constants: [],
      variables: [],
      declarations: [],
      placeholderBlocks: [],
      loweringBlocks: [],
    },
    {
      id: 'stdlib-000',
      kind: 'stdlib',
      packageDir: '/working/.tinygo-root/src/errors',
      sourceFiles: ['/working/.tinygo-root/src/errors/errors.go'],
      loweredSourcePath: '/working/tinygo-lowered/stdlib-000.c',
      packageName: '',
      imports: [],
      functions: [],
      types: [],
      constants: [],
      variables: [],
      declarations: [],
      placeholderBlocks: [],
      loweringBlocks: [],
    },
  ])
  const loweredCommandBatchManifest = JSON.parse(execution.result.generatedFiles[5].contents)
  assert.deepEqual(loweredCommandBatchManifest.compileCommands, [
    {
      argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-000.o'],
      cwd: '/working',
    },
    {
      argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-c', '/working/tinygo-lowered/stdlib-000.c', '-o', '/working/tinygo-lowered/stdlib-000.o'],
      cwd: '/working',
    },
  ])
  assert.deepEqual(loweredCommandBatchManifest.linkCommand, {
    argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-lowered/program-000.o', '/working/tinygo-lowered/stdlib-000.o', '-o', '/working/tinygo-lowered-out.wasm'],
    cwd: '/working',
  })
  const loweredArtifactManifest = JSON.parse(execution.result.generatedFiles[6].contents)
  assert.deepEqual(loweredArtifactManifest, {
    artifactOutputPath: '/working/tinygo-lowered-out.wasm',
    objectFiles: [
      '/working/tinygo-lowered/program-000.o',
      '/working/tinygo-lowered/stdlib-000.o',
    ],
  })
  const commandArtifactManifest = JSON.parse(execution.result.generatedFiles[7].contents)
  assert.deepEqual(commandArtifactManifest, {
    artifactOutputPath: '/working/out.wasm',
    bitcodeFiles: [
      '/working/tinygo-work/program-000.bc',
      '/working/tinygo-work/stdlib-000.bc',
    ],
  })
  const commandBatchManifest = JSON.parse(execution.result.generatedFiles[8].contents)
  assert.deepEqual(commandBatchManifest.compileCommands, [
    {
      argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
      cwd: '/working',
    },
    {
      argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-emit-llvm', '-c', '/working/tinygo-lowered/stdlib-000.c', '-o', '/working/tinygo-work/stdlib-000.bc'],
      cwd: '/working',
    },
  ])
  assert.deepEqual(commandBatchManifest.linkCommand, {
    argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '/working/tinygo-work/stdlib-000.bc', '-o', '/working/out.wasm'],
    cwd: '/working',
  })
  assert.match(execution.result.diagnostics[0], /backend prepared 2 compile jobs/)
})
