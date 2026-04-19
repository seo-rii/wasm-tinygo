import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  verifyCompileUnitManifestAgainstDriverBridgeManifest,
  verifyFrontendAnalysisAgainstDriverBridgeManifest,
  verifyFrontendAnalysisAgainstRealDriverBridgeManifest,
  verifyFrontendRealAdapterAgainstFrontendAnalysis,
  verifyTinyGoHostProbeManifestAgainstDriverMetadata,
} from '../src/compile-unit.ts'
import { resolveTinyGoToolchainPaths } from './tinygo-toolchain-paths.mjs'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const tinygoToolchainPaths = resolveTinyGoToolchainPaths()
const workDir = process.env.WASM_TINYGO_DRIVER_BRIDGE_WORK_DIR ?? await mkdtemp(path.join(tmpdir(), 'wasm-tinygo-driver-bridge-'))
const entryPath = process.env.WASM_TINYGO_DRIVER_BRIDGE_ENTRY_PATH ?? path.join(workDir, 'main.go')
const outputPath = process.env.WASM_TINYGO_DRIVER_BRIDGE_OUTPUT_PATH ?? path.join(workDir, 'main.wasm')
const requestPath =
  process.env.WASM_TINYGO_DRIVER_BRIDGE_REQUEST_PATH ??
  process.env.WASM_TINYGO_HOST_PROBE_REQUEST_PATH ??
  path.join(workDir, 'tinygo-request.json')
const resultPath = process.env.WASM_TINYGO_DRIVER_BRIDGE_RESULT_PATH ?? path.join(path.dirname(requestPath), 'tinygo-result.json')
const hostProbeManifestPath =
  process.env.WASM_TINYGO_DRIVER_BRIDGE_HOST_PROBE_MANIFEST_PATH ??
  process.env.WASM_TINYGO_HOST_PROBE_MANIFEST_PATH ??
  path.join(path.dirname(requestPath), 'tinygo-host-probe.json')
const bridgeManifestPath =
  process.env.WASM_TINYGO_DRIVER_BRIDGE_MANIFEST_PATH ??
  path.join(path.dirname(requestPath), 'tinygo-driver-bridge.json')
const frontendInputPath =
  process.env.WASM_TINYGO_DRIVER_BRIDGE_FRONTEND_INPUT_PATH ??
  path.join(path.dirname(requestPath), 'tinygo-frontend-input.json')
const frontendAnalysisInputPath =
  process.env.WASM_TINYGO_DRIVER_BRIDGE_FRONTEND_ANALYSIS_INPUT_PATH ??
  path.join(path.dirname(requestPath), 'tinygo-frontend-analysis-input.json')
const frontendResultPath =
  process.env.WASM_TINYGO_DRIVER_BRIDGE_FRONTEND_RESULT_PATH ??
  path.join(path.dirname(requestPath), 'tinygo-frontend-result.json')
const frontendAnalysisPath =
  process.env.WASM_TINYGO_DRIVER_BRIDGE_FRONTEND_ANALYSIS_PATH ??
  path.join(path.dirname(requestPath), 'tinygo-frontend-analysis.json')
const frontendRealAdapterPath =
  process.env.WASM_TINYGO_DRIVER_BRIDGE_FRONTEND_REAL_ADAPTER_PATH ??
  path.join(path.dirname(requestPath), 'tinygo-frontend-real-adapter.json')
const goBin = process.env.WASM_TINYGO_GO_BIN ?? 'go'
const tinygoBin = process.env.WASM_TINYGO_TINYGO_BIN ?? tinygoToolchainPaths.binPath
const tinygoRoot = process.env.WASM_TINYGO_TINYGOROOT ?? tinygoToolchainPaths.rootPath

let request
try {
  request = JSON.parse(await readFile(requestPath, 'utf8'))
} catch {
  await mkdir(path.dirname(entryPath), { recursive: true })
  await writeFile(path.join(path.dirname(entryPath), 'go.mod'), `module example.com/wasm-tinygo/hostprobe

go 1.22
`)
  await writeFile(entryPath, `package main

import "fmt"

func main() {
\tfmt.Println("tinygo-ok")
}
`)
  request = {
    command: 'build',
    planner: 'tinygo',
    entry: entryPath,
    optimize: 'z',
    output: outputPath,
    panic: 'trap',
    target: 'wasip1',
  }
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}
`)
}

const driver = spawnSync(goBin, ['run', './cmd/go-probe'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    WASM_TINYGO_REQUEST_PATH: requestPath,
    WASM_TINYGO_RESULT_PATH: resultPath,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (driver.status !== 0) {
  process.stderr.write(driver.stdout)
  process.stderr.write(driver.stderr)
  process.exit(driver.status ?? 1)
}

const hostProbe = spawnSync(process.execPath, [fileURLToPath(new URL('./probe-tinygo-host.mjs', import.meta.url))], {
  cwd: repoRoot,
  env: {
    ...process.env,
    WASM_TINYGO_HOST_PROBE_MANIFEST_PATH: hostProbeManifestPath,
    WASM_TINYGO_HOST_PROBE_REQUEST_PATH: requestPath,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (hostProbe.status !== 0) {
  process.stderr.write(hostProbe.stdout)
  process.stderr.write(hostProbe.stderr)
  process.exit(hostProbe.status ?? 1)
}

let entryPackage
let packageGraph
const packageListCommand = ['list', '-json', '-target', request.target ?? 'wasip1']
if (request.scheduler) {
  packageListCommand.push('-scheduler', request.scheduler)
}
packageListCommand.push('-deps', '.')
const packageList = spawnSync(tinygoBin, packageListCommand, {
  cwd: path.dirname(request.entry),
  env: {
    ...process.env,
    TINYGOROOT: tinygoRoot,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (packageList.error) {
  throw packageList.error
}
if (packageList.status !== 0) {
  process.stderr.write(packageList.stdout)
  process.stderr.write(packageList.stderr)
  console.error('tinygo list failed during driver bridge verification')
  process.exit(packageList.status ?? 1)
}
if (packageList.stdout.trim() !== '') {
  const parsedPackages = []
  let currentObjectStart = -1
  let depth = 0
  let inString = false
  let escaping = false
  for (let index = 0; index < packageList.stdout.length; index += 1) {
    const character = packageList.stdout[index]
    if (inString) {
      if (escaping) {
        escaping = false
        continue
      }
      if (character === '\\') {
        escaping = true
        continue
      }
      if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) {
        currentObjectStart = index
      }
      depth += 1
      continue
    }
    if (character === '}') {
      depth -= 1
      if (depth === 0 && currentObjectStart >= 0) {
        parsedPackages.push(JSON.parse(packageList.stdout.slice(currentObjectStart, index + 1)))
        currentObjectStart = -1
      }
    }
  }
  packageGraph = parsedPackages.map((packageInfo) => ({
    depOnly: Boolean(packageInfo.DepOnly),
    dir: packageInfo.Dir ?? '',
    goFiles: packageInfo.GoFiles ?? [],
    importPath: packageInfo.ImportPath ?? '',
    imports: packageInfo.Imports ?? [],
    modulePath: packageInfo.Module?.Path ?? '',
    name: packageInfo.Name ?? '',
    standard: Boolean(packageInfo.Standard),
  }))
  const resolvedEntryPackage =
    packageGraph.find((packageInfo) => !packageInfo.depOnly && (packageInfo.importPath ?? '') !== '') ??
    packageGraph.find((packageInfo) => (packageInfo.importPath ?? '') !== '')
  if (resolvedEntryPackage) {
    entryPackage = {
      dir: resolvedEntryPackage.dir,
      goFiles: resolvedEntryPackage.goFiles,
      importPath: resolvedEntryPackage.importPath,
      imports: resolvedEntryPackage.imports,
      name: resolvedEntryPackage.name,
    }
  }
}

const driverResult = JSON.parse(await readFile(resultPath, 'utf8'))
const hostProbeManifest = JSON.parse(await readFile(hostProbeManifestPath, 'utf8'))
const verification = verifyTinyGoHostProbeManifestAgainstDriverMetadata(hostProbeManifest, {
  buildTags: driverResult.metadata?.buildTags,
  entry: request.entry,
  gc: driverResult.metadata?.gc,
  goarch: driverResult.metadata?.goarch,
  goos: driverResult.metadata?.goos,
  llvmTarget: driverResult.metadata?.llvmTarget,
  optimize: driverResult.metadata?.optimize,
  output: request.output,
  panicStrategy: driverResult.metadata?.panicStrategy,
  scheduler: driverResult.metadata?.scheduler,
  target: request.target,
})

const frontendInputFile = (driverResult.files ?? []).find((file) => file.path === '/working/tinygo-frontend-input.json')
if (!frontendInputFile) {
  throw new Error('native driver did not produce /working/tinygo-frontend-input.json for bridge verification')
}
const frontendInput = JSON.parse(frontendInputFile.contents)
const canonicalBuildContext = {
  ...(frontendInput.buildContext ?? {}),
  target: verification.target,
  llvmTarget: verification.llvmTriple,
  goos: verification.goos,
  goarch: verification.goarch,
  gc: verification.gc,
  scheduler: verification.scheduler,
  buildTags: verification.driverBuildTags,
  modulePath: driverResult.metadata?.modulePath ?? frontendInput.buildContext?.modulePath ?? frontendInput.modulePath ?? '',
}
const canonicalToolchain = {
  ...(frontendInput.toolchain ?? {}),
  target: verification.target,
  llvmTarget: verification.llvmTriple,
  artifactOutputPath: verification.artifactOutputPath,
}
const frontendPackageGraphByImportPath = new Map(
  (frontendInput.packageGraph ?? [])
    .filter((packageInfo) => (packageInfo.importPath ?? '') !== '')
    .map((packageInfo) => [packageInfo.importPath ?? '', packageInfo]),
)
const frontendPackageOrderByImportPath = new Map(
  (frontendInput.packageGraph ?? [])
    .filter((packageInfo) => (packageInfo.importPath ?? '') !== '')
    .map((packageInfo, index) => [packageInfo.importPath ?? '', index]),
)
const frontendProgramPackage =
  (frontendInput.packageGraph ?? []).find((packageInfo) => !(packageInfo.depOnly ?? false) && (packageInfo.importPath ?? '') !== '')
const allCompileFileSet = new Set(frontendInput.sourceSelection?.allCompile ?? [])
const canonicalPackageGraphSource =
  (packageGraph ?? []).length === 0
    ? (frontendInput.packageGraph ?? [])
    : packageGraph.map((packageInfo) => {
        let frontendPackageInfo = frontendPackageGraphByImportPath.get(packageInfo.importPath ?? '')
        if (!frontendPackageInfo && (packageInfo.importPath ?? '') !== '' && (packageInfo.importPath ?? '') === (entryPackage?.importPath ?? '')) {
          frontendPackageInfo = frontendProgramPackage
        }
        const canonicalDir = frontendPackageInfo?.dir ?? packageInfo.dir ?? ''
        const canonicalGoFiles = [
          ...(
            frontendPackageInfo?.files?.goFiles ??
            frontendPackageInfo?.goFiles ??
            packageInfo.goFiles ??
            []
          ),
        ]
        return {
          depOnly: Boolean(packageInfo.depOnly),
          dir: canonicalDir,
          files: {
            goFiles: canonicalGoFiles,
          },
          importPath: packageInfo.importPath ?? '',
          imports: [...(packageInfo.imports ?? [])].filter((importPath) => importPath !== ''),
          modulePath: packageInfo.modulePath ?? '',
          name: packageInfo.name ?? '',
          standard: Boolean(packageInfo.standard),
        }
      })
const canonicalPackageGraph = canonicalPackageGraphSource
  .map((packageInfo, index) => {
    let orderIndex = frontendPackageOrderByImportPath.get(packageInfo.importPath ?? '')
    if (
      typeof orderIndex !== 'number' &&
      (packageInfo.importPath ?? '') !== '' &&
      (packageInfo.importPath ?? '') === (entryPackage?.importPath ?? '') &&
      frontendProgramPackage
    ) {
      orderIndex = frontendPackageOrderByImportPath.get(frontendProgramPackage.importPath ?? '')
    }
    return {
    depOnly: Boolean(packageInfo.depOnly),
    dir: packageInfo.dir ?? '',
    files: {
      goFiles: [...((packageInfo.files?.goFiles ?? packageInfo.goFiles ?? []))],
    },
    importPath: packageInfo.importPath ?? '',
    imports: [...(packageInfo.imports ?? [])].filter((importPath) => importPath !== ''),
    modulePath: packageInfo.modulePath ?? '',
    name: packageInfo.name ?? '',
    standard: Boolean(packageInfo.standard),
      orderIndex: typeof orderIndex === 'number' ? orderIndex : Number.MAX_SAFE_INTEGER,
      originalIndex: index,
    }
  })
  .filter((packageInfo) => {
    const packageFiles = (packageInfo.files?.goFiles ?? []).map((goFile) => path.join(packageInfo.dir ?? '', goFile))
    return packageFiles.length !== 0 && packageFiles.every((filePath) => allCompileFileSet.has(filePath))
  })
  .sort((left, right) => {
    if ((left.orderIndex ?? Number.MAX_SAFE_INTEGER) !== (right.orderIndex ?? Number.MAX_SAFE_INTEGER)) {
      return (left.orderIndex ?? Number.MAX_SAFE_INTEGER) - (right.orderIndex ?? Number.MAX_SAFE_INTEGER)
    }
    return (left.originalIndex ?? 0) - (right.originalIndex ?? 0)
  })
  .map(({ orderIndex: _orderIndex, originalIndex: _originalIndex, ...packageInfo }) => packageInfo)
const canonicalFrontendInput = {
  ...frontendInput,
  buildContext: canonicalBuildContext,
  toolchain: canonicalToolchain,
  packageGraph: canonicalPackageGraph.length === 0
    ? (frontendInput.packageGraph ?? [])
    : canonicalPackageGraph,
}
await writeFile(frontendInputPath, `${JSON.stringify(canonicalFrontendInput, null, 2)}
`)
const frontendAnalysisInput = {
  ...canonicalFrontendInput,
}
delete frontendAnalysisInput.compileUnits
await writeFile(frontendAnalysisInputPath, `${JSON.stringify(frontendAnalysisInput, null, 2)}
`)

const frontendAnalysis = spawnSync(goBin, ['run', './cmd/go-probe'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    WASM_TINYGO_MODE: 'frontend-analysis',
    WASM_TINYGO_FRONTEND_INPUT_PATH: frontendAnalysisInputPath,
    WASM_TINYGO_FRONTEND_ANALYSIS_PATH: frontendAnalysisPath,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (frontendAnalysis.status !== 0) {
  process.stderr.write(frontendAnalysis.stdout)
  process.stderr.write(frontendAnalysis.stderr)
  process.exit(frontendAnalysis.status ?? 1)
}
const frontendAnalysisResult = JSON.parse(await readFile(frontendAnalysisPath, 'utf8'))
if (!frontendAnalysisResult.ok || !frontendAnalysisResult.analysis) {
  throw new Error('frontend analysis bridge verification did not produce a normalized analysis payload')
}

const frontendRealAdapter = spawnSync(goBin, ['run', './cmd/go-probe'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    WASM_TINYGO_MODE: 'frontend-real-adapter',
    WASM_TINYGO_FRONTEND_INPUT_PATH: frontendInputPath,
    WASM_TINYGO_FRONTEND_ANALYSIS_PATH: frontendAnalysisPath,
    WASM_TINYGO_FRONTEND_REAL_ADAPTER_PATH: frontendRealAdapterPath,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (frontendRealAdapter.status !== 0) {
  process.stderr.write(frontendRealAdapter.stdout)
  process.stderr.write(frontendRealAdapter.stderr)
  process.exit(frontendRealAdapter.status ?? 1)
}
const frontendRealAdapterResult = JSON.parse(await readFile(frontendRealAdapterPath, 'utf8'))
if (!frontendRealAdapterResult.ok || !frontendRealAdapterResult.adapter) {
  throw new Error('frontend real adapter bridge verification did not produce a normalized adapter payload')
}
verifyFrontendRealAdapterAgainstFrontendAnalysis(
  frontendRealAdapterResult.adapter,
  frontendAnalysisResult.analysis,
)
const analysisPackageGraph = (frontendAnalysisResult.analysis?.packageGraph ?? []).map((packageInfo) => ({
  depOnly: Boolean(packageInfo.depOnly),
  dir: packageInfo.dir ?? '',
  goFiles: packageInfo.files?.goFiles ?? [],
  importPath: packageInfo.importPath ?? '',
  imports: [...(packageInfo.imports ?? [])].filter((importPath) => importPath !== ''),
  modulePath: packageInfo.modulePath ?? '',
  name: packageInfo.name ?? '',
  standard: Boolean(packageInfo.standard),
})).filter((packageInfo) => (packageInfo.importPath ?? '') !== '' || (packageInfo.goFiles ?? []).length !== 0)

const frontend = spawnSync(goBin, ['run', './cmd/go-probe'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    WASM_TINYGO_MODE: 'frontend',
    WASM_TINYGO_FRONTEND_ANALYSIS_PATH: frontendAnalysisPath,
    WASM_TINYGO_FRONTEND_REAL_ADAPTER_PATH: frontendRealAdapterPath,
    WASM_TINYGO_FRONTEND_INPUT_PATH: frontendInputPath,
    WASM_TINYGO_FRONTEND_RESULT_PATH: frontendResultPath,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
if (frontend.status !== 0) {
  process.stderr.write(frontend.stdout)
  process.stderr.write(frontend.stderr)
  process.exit(frontend.status ?? 1)
}
const frontendResult = JSON.parse(await readFile(frontendResultPath, 'utf8'))
const compileUnitManifestFile = (frontendResult.generatedFiles ?? []).find((file) => file.path === '/working/tinygo-compile-unit.json')
if (!compileUnitManifestFile) {
  throw new Error('frontend bridge verification did not produce /working/tinygo-compile-unit.json')
}
const compileUnitManifest = JSON.parse(compileUnitManifestFile.contents)
compileUnitManifest.toolchain = {
  ...(compileUnitManifest.toolchain ?? {}),
  target:
    compileUnitManifest.toolchain?.target ??
    frontendAnalysisResult.analysis?.toolchain?.target ??
    frontendInput.toolchain?.target ??
    verification.target,
  llvmTarget:
    compileUnitManifest.toolchain?.llvmTarget ??
    frontendAnalysisResult.analysis?.toolchain?.llvmTarget ??
    frontendInput.buildContext?.llvmTarget ??
    verification.llvmTriple,
  artifactOutputPath:
    compileUnitManifest.toolchain?.artifactOutputPath ??
    frontendInput.toolchain?.artifactOutputPath ??
    canonicalToolchain.artifactOutputPath ??
    verification.artifactOutputPath,
}
if (!entryPackage || (entryPackage.importPath ?? '') === '') {
  const programCompileUnit = (compileUnitManifest.compileUnits ?? []).find((compileUnit) => compileUnit.kind === 'program')
  if (programCompileUnit) {
    const packageDir = programCompileUnit.packageDir ?? ''
    const goFiles = (programCompileUnit.files ?? []).map((file) => {
      if (packageDir !== '' && file.startsWith(`${packageDir}/`)) {
        return file.slice(packageDir.length + 1)
      }
      return path.basename(file)
    })
    entryPackage = {
      dir: packageDir,
      goFiles,
      importPath: programCompileUnit.importPath ?? '',
      imports: [...(programCompileUnit.imports ?? [])].filter((importPath) => importPath !== ''),
      name: programCompileUnit.packageName ?? '',
    }
  }
}
const canonicalAnalysisProgramPackage =
  analysisPackageGraph.find((packageInfo) => !packageInfo.depOnly && (packageInfo.importPath ?? '') !== '') ??
  analysisPackageGraph.find((packageInfo) => (packageInfo.importPath ?? '') !== '')
if (packageGraph && packageGraph.length > 0 && canonicalAnalysisProgramPackage) {
  packageGraph = packageGraph.map((packageInfo) => {
    if (!packageInfo.depOnly && ((packageInfo.importPath ?? '') === '' || packageInfo.importPath === 'command-line-arguments')) {
      return {
        ...canonicalAnalysisProgramPackage,
        depOnly: Boolean(packageInfo.depOnly),
        standard: Boolean(packageInfo.standard),
      }
    }
    return packageInfo
  })
}
if (
  canonicalAnalysisProgramPackage &&
  (!entryPackage ||
    (entryPackage.importPath ?? '') === '' ||
    entryPackage.importPath === 'command-line-arguments')
) {
  entryPackage = {
    dir: canonicalAnalysisProgramPackage.dir,
    goFiles: canonicalAnalysisProgramPackage.goFiles,
    importPath: canonicalAnalysisProgramPackage.importPath,
    imports: canonicalAnalysisProgramPackage.imports,
    name: canonicalAnalysisProgramPackage.name,
  }
}
if (!packageGraph || packageGraph.length === 0) {
  if (analysisPackageGraph.length > 0) {
    packageGraph = analysisPackageGraph
    const resolvedEntryPackage =
      analysisPackageGraph.find((packageInfo) => !packageInfo.depOnly && (packageInfo.importPath ?? '') !== '') ??
      analysisPackageGraph.find((packageInfo) => (packageInfo.importPath ?? '') !== '')
    if (resolvedEntryPackage) {
      entryPackage = {
        dir: resolvedEntryPackage.dir,
        goFiles: resolvedEntryPackage.goFiles,
        importPath: resolvedEntryPackage.importPath,
        imports: resolvedEntryPackage.imports,
        name: resolvedEntryPackage.name,
      }
    }
  } else {
    packageGraph = (compileUnitManifest.compileUnits ?? []).map((compileUnit) => {
      const packageDir = compileUnit.packageDir ?? ''
      return {
        depOnly: (compileUnit.kind ?? '') !== 'program',
        dir: packageDir,
        goFiles: (compileUnit.files ?? []).map((file) => {
          if (packageDir !== '' && file.startsWith(`${packageDir}/`)) {
            return file.slice(packageDir.length + 1)
          }
          return path.basename(file)
        }),
        importPath: compileUnit.importPath ?? '',
        imports: [...(compileUnit.imports ?? [])].filter((importPath) => importPath !== ''),
        modulePath: (compileUnit.kind ?? '') === 'stdlib' ? '' : (driverResult.metadata?.modulePath ?? frontendAnalysisResult.analysis?.buildContext?.modulePath ?? ''),
        name: compileUnit.packageName ?? '',
        standard: (compileUnit.kind ?? '') === 'stdlib',
      }
    }).filter((packageInfo) => (packageInfo.importPath ?? '') !== '' || (packageInfo.goFiles ?? []).length !== 0)
  }
}
const frontendHandoff = verifyCompileUnitManifestAgainstDriverBridgeManifest(compileUnitManifest, {
  artifactOutputPath: verification.artifactOutputPath,
  entryFile: verification.entryFile,
  entryPackage,
  llvmTriple: verification.llvmTriple,
  packageGraph,
  target: verification.target,
})
const expectedFrontendAnalysisCompileUnits =
  canonicalPackageGraph.length === 0
    ? (frontendAnalysisResult.analysis?.compileUnits ?? [])
    : (frontendAnalysisResult.analysis?.compileUnits ?? []).map((compileUnit) => {
      const compileUnitImportPath = compileUnit.importPath ?? ''
      const packageInfo =
        canonicalPackageGraph.find((candidate) => (candidate.importPath ?? '') === compileUnitImportPath) ??
        (
          (compileUnit.kind ?? '') === 'program' && compileUnitImportPath === 'command-line-arguments'
            ? canonicalPackageGraph.find((candidate) => !candidate.depOnly && (candidate.importPath ?? '') !== '')
            : undefined
        )
      return {
        ...compileUnit,
        imports: packageInfo ? [...(packageInfo.imports ?? [])].filter((importPath) => importPath !== '') : [...(compileUnit.imports ?? [])],
      }
    })
const expectedFrontendAnalysisPackageGraph =
  canonicalPackageGraph.length === 0
    ? (frontendAnalysisResult.analysis?.packageGraph ?? [])
    : (frontendAnalysisResult.analysis?.packageGraph ?? []).map((packageInfo) => {
      const packageImportPath = packageInfo.importPath ?? ''
      const canonicalPackageInfo =
        canonicalPackageGraph.find((candidate) => (candidate.importPath ?? '') === packageImportPath) ??
        (
          !(packageInfo.depOnly ?? false) && packageImportPath === 'command-line-arguments'
            ? canonicalPackageGraph.find((candidate) => !candidate.depOnly && (candidate.importPath ?? '') !== '')
            : undefined
        )
      return {
        ...packageInfo,
        imports: canonicalPackageInfo
          ? [...(canonicalPackageInfo.imports ?? [])].filter((importPath) => importPath !== '')
          : [...(packageInfo.imports ?? [])],
      }
    })
const expectedFrontendAnalysis = {
  ...frontendAnalysisResult.analysis,
  buildContext: canonicalBuildContext,
  compileUnits: expectedFrontendAnalysisCompileUnits,
  packageGraph: expectedFrontendAnalysisPackageGraph,
}
verifyFrontendAnalysisAgainstDriverBridgeManifest(frontendAnalysisResult.analysis, {
  artifactOutputPath: verification.artifactOutputPath,
  driverBuildTags: verification.driverBuildTags,
  entryFile: verification.entryFile,
  entryPackage,
  frontendAnalysis: expectedFrontendAnalysis,
  frontendHandoff,
  gc: verification.gc,
  goarch: verification.goarch,
  goos: verification.goos,
  llvmTriple: verification.llvmTriple,
  packageGraph,
  scheduler: verification.scheduler,
  target: verification.target,
})
const expectedFrontendRealAdapter = {
  ...frontendRealAdapterResult.adapter,
  buildContext: canonicalBuildContext,
}
verifyFrontendAnalysisAgainstRealDriverBridgeManifest(frontendRealAdapterResult.adapter, {
  artifactOutputPath: verification.artifactOutputPath,
  driverBuildTags: verification.driverBuildTags,
  entryFile: verification.entryFile,
  entryPackage,
  frontendRealAdapter: expectedFrontendRealAdapter,
  gc: verification.gc,
  goarch: verification.goarch,
  goos: verification.goos,
  llvmTriple: verification.llvmTriple,
  packageGraph,
  scheduler: verification.scheduler,
  target: verification.target,
})

await writeFile(bridgeManifestPath, `${JSON.stringify({
  artifactOutputPath: verification.artifactOutputPath,
  commandArgv: verification.commandArgv,
  driverBuildTags: verification.driverBuildTags,
  driverResultPath: resultPath,
  entryFile: verification.entryFile,
  entryPackage,
  frontendAnalysis: frontendAnalysisResult.analysis,
  frontendAnalysisInput,
  frontendRealAdapter: frontendRealAdapterResult.adapter,
  frontendHandoff,
  realFrontendAnalysis: frontendRealAdapterResult.adapter,
  gc: verification.gc,
  goarch: verification.goarch,
  goos: verification.goos,
  hostBuildTags: verification.hostBuildTags,
  hostProbeManifestPath,
  llvmTriple: verification.llvmTriple,
  packageGraph,
  runtime: hostProbeManifest.runtime ?? {},
  scheduler: verification.scheduler,
  target: verification.target,
  toolchain: hostProbeManifest.toolchain ?? {},
  workDir,
}, null, 2)}
`)

console.log(`Wrote TinyGo driver bridge manifest to ${bridgeManifestPath}`)
