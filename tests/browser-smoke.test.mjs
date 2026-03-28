import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

import { normalizeTinyGoDriverBridgeManifestForBrowser } from '../src/compile-unit.ts'

test('browser smoke completes TinyGo bootstrap flow through test hooks', { timeout: 600000 }, async (t) => {
  const browserWorkspaceFiles = {
    'go.mod': `module example.com/browserprobe

go 1.22
`,
    'helper/helper.go': `package helper

import "fmt"

func Run() {
\tfmt.Println("browser-ok")
}
`,
    'main.go': `package main

import "example.com/browserprobe/helper"

func main() {
\thelper.Run()
}
`,
  }
  const invalidBrowserWorkspaceFiles = {
    ...browserWorkspaceFiles,
    'main.go': `package main

import "example.com/browserprobe/missing"

func main() {
\tmissing.Run()
}
`,
  }
  const listenError = await new Promise((resolve) => {
    const server = createServer()
    server.once('error', (error) => resolve(error))
    server.listen(0, '127.0.0.1', () => {
      server.close(() => resolve(null))
    })
  })
  if (listenError && listenError instanceof Error) {
    const message = listenError.message
    if (
      message.includes('listen EPERM') ||
      message.includes('operation not permitted') ||
      message.includes('Operation not permitted')
    ) {
      t.skip(`browser smoke skipped: loopback listen is not permitted in this sandbox\n${message}`)
      return
    }
    throw listenError
  }

  const cwd = new URL('..', import.meta.url)
  const bridgeWorkDir = await mkdtemp(path.join(tmpdir(), 'wasm-tinygo-browser-bridge-'))
  t.after(async () => {
    await rm(bridgeWorkDir, { recursive: true, force: true })
  })
  const bridgeEntryPath = path.join(bridgeWorkDir, 'main.go')
  const bridgeOutputPath = path.join(bridgeWorkDir, 'out.wasm')
  const bridgeRequestPath = path.join(bridgeWorkDir, 'tinygo-request.json')
  const bridgeManifestPath = path.join(bridgeWorkDir, 'tinygo-driver-bridge.json')
  await mkdir(path.join(bridgeWorkDir, 'helper'), { recursive: true })
  await writeFile(path.join(bridgeWorkDir, 'go.mod'), browserWorkspaceFiles['go.mod'])
  await writeFile(path.join(bridgeWorkDir, 'helper', 'helper.go'), browserWorkspaceFiles['helper/helper.go'])
  await writeFile(bridgeEntryPath, browserWorkspaceFiles['main.go'])
  await writeFile(bridgeRequestPath, `${JSON.stringify({
    command: 'build',
    planner: 'tinygo',
    entry: bridgeEntryPath,
    optimize: 'z',
    output: bridgeOutputPath,
    panic: 'trap',
    scheduler: 'asyncify',
    target: 'wasm',
  }, null, 2)}
`)
  const bridge = spawn('npm', ['run', 'probe:tinygo-driver-bridge'], {
    cwd,
    env: {
      ...process.env,
      WASM_TINYGO_DRIVER_BRIDGE_MANIFEST_PATH: bridgeManifestPath,
      WASM_TINYGO_DRIVER_BRIDGE_REQUEST_PATH: bridgeRequestPath,
      WASM_TINYGO_DRIVER_BRIDGE_WORK_DIR: bridgeWorkDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let bridgeOutput = ''
  bridge.stdout.on('data', (chunk) => {
    bridgeOutput += chunk.toString()
  })
  bridge.stderr.on('data', (chunk) => {
    bridgeOutput += chunk.toString()
  })
  const bridgeExitCode = await new Promise((resolve, reject) => {
    bridge.once('error', reject)
    bridge.once('exit', resolve)
  })
  assert.equal(bridgeExitCode, 0, bridgeOutput)
  const driverBridgeManifest = normalizeTinyGoDriverBridgeManifestForBrowser(
    JSON.parse(await readFile(bridgeManifestPath, 'utf8')),
  )
  const { frontendRealAdapter, ...aliasOnlyDriverBridgeManifest } = driverBridgeManifest
  aliasOnlyDriverBridgeManifest.realFrontendAnalysis = driverBridgeManifest.frontendRealAdapter
  const driftedAnalysisInputBridgeManifest = JSON.parse(JSON.stringify(driverBridgeManifest))
  driftedAnalysisInputBridgeManifest.frontendAnalysisInput.buildContext.target = 'mismatch-target'
  const driftedDriverBridgeManifest = JSON.parse(JSON.stringify(driverBridgeManifest))
  driftedDriverBridgeManifest.frontendAnalysis.buildContext.target = 'mismatch-target'
  assert.ok((driverBridgeManifest.packageGraph?.length ?? 0) >= 1)
  assert.match(driverBridgeManifest.toolchain?.version ?? '', /0\.40\.1/)

  const build = spawn('npm', ['run', 'build'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let buildOutput = ''
  build.stdout.on('data', (chunk) => {
    buildOutput += chunk.toString()
  })
  build.stderr.on('data', (chunk) => {
    buildOutput += chunk.toString()
  })
  const buildExitCode = await new Promise((resolve, reject) => {
    build.once('error', reject)
    build.once('exit', resolve)
  })
  assert.equal(buildExitCode, 0, buildOutput)

  const preview = spawn(process.execPath, [new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname, 'preview', '--host', '127.0.0.1', '--port', '4175'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const previewExited = new Promise((resolve, reject) => {
    preview.once('error', reject)
    preview.once('exit', resolve)
  })
  t.after(async () => {
    if (preview.exitCode === null && preview.signalCode === null) {
      preview.kill('SIGINT')
    }
    await previewExited
  })

  let previewOutput = ''
  let previewUrl = ''
  preview.stdout.on('data', (chunk) => {
    previewOutput += chunk.toString()
    const matchedUrl = previewOutput.match(/http:\/\/127\.0\.0\.1:(\d+)\//)
    if (matchedUrl) {
      previewUrl = matchedUrl[0]
    }
  })
  preview.stderr.on('data', (chunk) => {
    previewOutput += chunk.toString()
    const matchedUrl = previewOutput.match(/http:\/\/127\.0\.0\.1:(\d+)\//)
    if (matchedUrl) {
      previewUrl = matchedUrl[0]
    }
  })

  let previewReady = false
  for (let index = 0; index < 120; index += 1) {
    if (previewUrl !== '') {
      previewReady = true
      break
    }
    await delay(500)
  }
  if (
    !previewReady &&
    (previewOutput.includes('listen EPERM') ||
      previewOutput.includes('operation not permitted') ||
      previewOutput.includes('Operation not permitted'))
  ) {
    t.skip(`browser smoke skipped: preview server is not permitted in this sandbox\n${previewOutput}`)
    return
  }
  assert.equal(previewReady, true, previewOutput)
  assert.notEqual(previewUrl, '', previewOutput)

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('Operation not permitted') ||
      message.includes('operation not permitted') ||
      message.includes('setsockopt') ||
      message.includes('sandbox_host_linux.cc')
    ) {
      t.skip(`browser smoke skipped: Chromium launch is not permitted in this sandbox\n${message}`)
      return
    }
    throw error
  }
  t.after(async () => {
    await browser.close()
  })

  const context = await browser.newContext()
  await context.addInitScript(() => {
    window.__codexUnhandledRejections = []
    window.addEventListener('unhandledrejection', (event) => {
      window.__codexUnhandledRejections.push(
        event.reason instanceof Error ? event.reason.message : String(event.reason),
      )
    })
  })

  let page = await context.newPage()
  let gotoError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(previewUrl, { waitUntil: 'load', timeout: 120000 })
      gotoError = null
      break
    } catch (error) {
      gotoError = error
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Page crashed') || attempt === 2) {
        throw error
      }
      await page.close().catch(() => {})
      await delay(500)
      page = await context.newPage()
    }
  }
  if (gotoError) {
    throw gotoError
  }
  const pageErrors = []
  page.on('pageerror', (error) => {
    pageErrors.push(error instanceof Error ? error.message : String(error))
  })
  await page.waitForFunction(
    () =>
      typeof window.__wasmTinygoTestHooks?.boot === 'function' &&
      typeof window.__wasmTinygoTestHooks?.readFrontendAnalysisInputManifest === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setBuildRequestOverrides === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setDriverBridgeManifest === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setWorkspaceFiles === 'function',
    null,
    { timeout: 120000 },
  )

  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  await page.evaluate(() => window.__wasmTinygoTestHooks.plan())
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())

  const frontendAnalysisInputManifest = await page.evaluate(
    () => window.__wasmTinygoTestHooks.readFrontendAnalysisInputManifest(),
  )
  const phases = await page.locator('[data-phase]').allTextContents()
  const activity = await page.locator('#terminal-output').textContent()
  const sourcePreview = await page.locator('.source-panel').first().textContent()

  assert.match(phases.join('\n'), /emception worker\s+ready/)
  assert.match(phases.join('\n'), /build driver plan\s+\d+ steps/)
  assert.match(phases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(phases.join('\n'), /front-end verification\s+verified/)
  assert.deepEqual(frontendAnalysisInputManifest, driverBridgeManifest.frontendAnalysisInput)
  assert.match(activity ?? '', /bootstrap roundtrip verified/)
  assert.match(activity ?? '', /backend materialize \/working\/tinygo-lowered-sources\.json/)
  assert.match(activity ?? '', /backend materialize \/working\/tinygo-lowered-bitcode\.json/)
  assert.match(activity ?? '', /backend materialize \/working\/tinygo-lowered-ir\.json/)
  assert.match(activity ?? '', /backend materialize \/working\/tinygo-lowered\/program-000\.c/)
  assert.match(activity ?? '', /backend lowered ir units=\d+ imports=\d+ functions=\d+ types=\d+ consts=\d+ vars=\d+ decls=\d+/)
  assert.match(activity ?? '', /backend materialize \/working\/tinygo-lowered-command-batch\.json/)
  assert.match(activity ?? '', /backend materialize \/working\/tinygo-lowered-artifact\.json/)
  assert.match(activity ?? '', /backend materialize \/working\/tinygo-command-artifact\.json/)
  assert.match(activity ?? '', /frontend lowered artifact ready: \/working\/tinygo-lowered-out\.wasm/)
  assert.match(activity ?? '', /frontend lowered bitcode ready count=\d+ total=[\d,]+ bytes/)
  assert.match(activity ?? '', /frontend lowered bitcode verified format=llvm-bc count=\d+/)
  assert.match(activity ?? '', /frontend lowered objects ready count=\d+ total=[\d,]+ bytes/)
  assert.match(activity ?? '', /frontend lowered objects verified format=wasm count=\d+/)
  assert.match(activity ?? '', /frontend final artifact verified format=wasm output=\/working\/out\.wasm/)
  assert.match(activity ?? '', /frontend final artifact compiled module=ok/)
  assert.match(activity ?? '', /driver tinygo-style planner validated target=wasm optimize=-Oz scheduler=asyncify panic=trap/)
  assert.match(activity ?? '', /frontend input bridge verified target=wasm llvm=wasm32-unknown-wasi scheduler=asyncify packages=[1-9]\d*/)
  assert.match(activity ?? '', /frontend analysis input bridge verified target=wasm llvm=wasm32-unknown-wasi scheduler=asyncify packages=[1-9]\d*/)
  assert.match(activity ?? '', /frontend analysis input source=bridge/)
  assert.match(activity ?? '', /frontend analysis verified target=wasm llvm=wasm32-unknown-wasi groups=6 compileUnits=[1-9]\d* allCompile=[1-9]\d*/)
  assert.match(activity ?? '', /frontend build mode=frontend/)
  assert.match(activity ?? '', /frontend build source=real-adapter/)
  assert.match(activity ?? '', /frontend analysis bridge verified target=wasm llvm=wasm32-unknown-wasi groups=6 compileUnits=[1-9]\d* allCompile=[1-9]\d* alias=direct program=example\.com\/browserprobe/)
  assert.match(activity ?? '', /frontend real adapter verified target=wasm llvm=wasm32-unknown-wasi groups=4 compileUnits=[1-9]\d* allCompile=[1-9]\d*/)
  assert.match(activity ?? '', /frontend real adapter seam verified target=wasm llvm=wasm32-unknown-wasi groups=4 compileUnits=[1-9]\d* allCompile=[1-9]\d* alias=direct/)
  assert.match(activity ?? '', /frontend real adapter bridge verified target=wasm llvm=wasm32-unknown-wasi groups=4 compileUnits=[1-9]\d* allCompile=[1-9]\d* alias=direct source=canonical/)
  assert.match(activity ?? '', /frontend bridge verified target=wasm llvm=wasm32-unknown-wasi program=main imports=1 packages=[1-9]\d*/)
  assert.match(activity ?? '', /frontend bridge coverage compileUnits=[1-9]\d* graphPackages=[1-9]\d* coveredPackages=[1-9]\d*\/[1-9]\d* compileUnitFiles=[1-9]\d* coveredFiles=[1-9]\d*\/[1-9]\d* depOnly=[1-9]\d* standard=[1-9]\d* local=2 alias=direct/)
  assert.match(activity ?? '', /frontend bridge toolchain version=.*0\.40\.1/)
  assert.match(activity ?? '', /frontend lowered probe verified units=\d+ kinds=\d+ hashes=\d+ imports=\d+ importPaths=\d+ blankImports=\d+ dotImports=\d+ aliasedImports=\d+ funcs=\d+ funcNameHashes=\d+ funcLiterals=\d+ funcParameters=\d+ funcResults=\d+ variadicParameters=\d+ namedResults=\d+ typeParameters=\d+ genericFunctions=\d+ genericTypes=\d+ calls=\d+ builtinCalls=\d+ appendCalls=\d+ lenCalls=\d+ makeCalls=\d+ capCalls=\d+ copyCalls=\d+ panicCalls=\d+ recoverCalls=\d+ newCalls=\d+ deleteCalls=\d+ compositeLiterals=\d+ selectorExpressions=\d+ selectorNameHashes=\d+ indexExpressions=\d+ sliceExpressions=\d+ keyValueExpressions=\d+ typeAssertions=\d+ blankIdentifiers=\d+ blankAssignmentTargets=\d+ unaryExpressions=\d+ binaryExpressions=\d+ sends=\d+ receives=\d+ assignments=\d+ defines=\d+ increments=\d+ decrements=\d+ returns=\d+ goStatements=\d+ deferStatements=\d+ ifStatements=\d+ rangeStatements=\d+ switchStatements=\d+ typeSwitchStatements=\d+ typeSwitchCases=\d+ typeSwitchGuardNameHashes=\d+ typeSwitchCaseTypeHashes=\d+ selectStatements=\d+ switchCases=\d+ selectClauses=\d+ forStatements=\d+ breakStatements=\d+ breakLabelNameHashes=\d+ continueStatements=\d+ continueLabelNameHashes=\d+ labels=\d+ labelNameHashes=\d+ gotos=\d+ gotoLabelNameHashes=\d+ fallthroughs=\d+ methods=\d+ methodNameHashes=\d+ methodSignatureHashes=\d+ exportedMethodNameHashes=\d+ exportedMethodSignatureHashes=\d+ exports=\d+ exportedFunctionNameHashes=\d+ types=\d+ typeNameHashes=\d+ exportedTypes=\d+ exportedTypeNameHashes=\d+ structs=\d+ interfaces=\d+ mapTypes=\d+ chanTypes=\d+ sendOnlyChanTypes=\d+ receiveOnlyChanTypes=\d+ arrayTypes=\d+ sliceTypes=\d+ pointerTypes=\d+ structFields=\d+ embeddedStructFields=\d+ taggedStructFields=\d+ structFieldNameHashes=\d+ structFieldTypeHashes=\d+ embeddedStructFieldTypeHashes=\d+ taggedStructFieldTagHashes=\d+ interfaceMethods=\d+ interfaceMethodNameHashes=\d+ interfaceMethodSignatureHashes=\d+ embeddedInterfaceMethods=\d+ embeddedInterfaceMethodNameHashes=\d+ consts=\d+ constNameHashes=\d+ vars=\d+ varNameHashes=\d+ exportedConsts=\d+ exportedConstNameHashes=\d+ exportedVars=\d+ exportedVarNameHashes=\d+ declarationCounts=\d+ declarationNameHashes=\d+ declarationSignatureHashes=\d+ declarationKindHashes=\d+ declarationExportedCounts=\d+ declarationExportedNameHashes=\d+ declarationExportedSignatureHashes=\d+ declarationExportedKindHashes=\d+ declarationMethodCounts=\d+ declarationMethodNameHashes=\d+ declarationMethodSignatureHashes=\d+ declarationMethodKindHashes=\d+ placeholderBlocks=\d+ placeholderBlockHashes=\d+ placeholderBlockSignatureHashes=\d+ placeholderBlockRuntimeHashes=\d+ loweringBlocks=\d+ loweringBlockHashes=\d+ loweringBlockRuntimeHashes=\d+ mains=\d+ inits=\d+/)
  assert.doesNotMatch(activity ?? '', /bootstrap exports checksum=/)
  assert.doesNotMatch(activity ?? '', /bootstrap exports manifestBytes=/)
  assert.doesNotMatch(activity ?? '', /frontend input target=/)
  assert.doesNotMatch(sourcePreview ?? '', /\/working\/tinygo-bootstrap\.json/)
  assert.doesNotMatch(sourcePreview ?? '', /\/working\/tinygo-frontend-input\.json/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  const resetFrontendAnalysisInputManifest = await page.evaluate(
    () => window.__wasmTinygoTestHooks.readFrontendAnalysisInputManifest(),
  )
  const resetPhases = await page.locator('[data-phase]').allTextContents()
  const resetActivity = await page.locator('#terminal-output').textContent()
  assert.equal(resetFrontendAnalysisInputManifest, null)
  assert.match(resetPhases.join('\n'), /emception worker\s+idle/)
  assert.match(resetPhases.join('\n'), /build driver plan\s+idle/)
  assert.match(resetPhases.join('\n'), /build execution\s+idle/)
  assert.match(resetPhases.join('\n'), /front-end verification\s+idle/)
  assert.match(resetActivity ?? '', /log cleared/)

  await page.evaluate(() => {
    window.__codexHookBootPromise = window.__wasmTinygoTestHooks.boot()
  })
  await page.waitForFunction(
    () =>
      document.querySelector('[data-action="plan"]')?.disabled === true &&
      document.querySelector('[data-action="execute"]')?.disabled === true &&
      document.querySelector('[data-action="reset"]')?.disabled === true,
    null,
    { timeout: 120000 },
  )
  const hookBootLockedState = await page.evaluate(() => ({
    plan: document.querySelector('[data-action="plan"]')?.disabled ?? null,
    execute: document.querySelector('[data-action="execute"]')?.disabled ?? null,
    reset: document.querySelector('[data-action="reset"]')?.disabled ?? null,
  }))
  const hookBootPlanError = await page.evaluate(async () => {
    try {
      await window.__wasmTinygoTestHooks.plan()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })
  await page.evaluate(async () => await window.__codexHookBootPromise)
  const hookBootUnlockedState = await page.evaluate(() => ({
    plan: document.querySelector('[data-action="plan"]')?.disabled ?? null,
    execute: document.querySelector('[data-action="execute"]')?.disabled ?? null,
    reset: document.querySelector('[data-action="reset"]')?.disabled ?? null,
  }))
  assert.deepEqual(hookBootLockedState, { plan: true, execute: true, reset: true })
  assert.match(hookBootPlanError ?? '', /wasm-tinygo test hook action already running: booting/)
  assert.deepEqual(hookBootUnlockedState, { plan: false, execute: false, reset: false })
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  const redundantReadyBootStatuses = await page.evaluate(async () => {
    const settled = await Promise.allSettled([
      window.__wasmTinygoTestHooks.boot(),
      window.__wasmTinygoTestHooks.plan(),
    ])
    return settled.map((result) => {
      if (result.status === 'fulfilled') {
        return 'fulfilled'
      }
      return result.reason instanceof Error ? result.reason.message : String(result.reason)
    })
  })
  const redundantReadyBootPhases = await page.locator('[data-phase]').allTextContents()
  assert.deepEqual(redundantReadyBootStatuses, ['fulfilled', 'fulfilled'])
  assert.match(redundantReadyBootPhases.join('\n'), /build driver plan\s+\d+ steps/)
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driverBridgeManifest)
  const redundantReadyExecuteStatuses = await page.evaluate(async () => {
    const settled = await Promise.allSettled([
      window.__wasmTinygoTestHooks.boot(),
      window.__wasmTinygoTestHooks.execute(),
    ])
    return settled.map((result) => {
      if (result.status === 'fulfilled') {
        return 'fulfilled'
      }
      return result.reason instanceof Error ? result.reason.message : String(result.reason)
    })
  })
  const redundantReadyExecuteFrontendAnalysisInputManifest = await page.evaluate(
    () => window.__wasmTinygoTestHooks.readFrontendAnalysisInputManifest(),
  )
  const redundantReadyExecutePhases = await page.locator('[data-phase]').allTextContents()
  const redundantReadyExecuteActivity = await page.locator('#terminal-output').textContent()
  assert.deepEqual(redundantReadyExecuteStatuses, ['fulfilled', 'fulfilled'])
  assert.deepEqual(redundantReadyExecuteFrontendAnalysisInputManifest, driverBridgeManifest.frontendAnalysisInput)
  assert.match(redundantReadyExecutePhases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(redundantReadyExecutePhases.join('\n'), /front-end verification\s+verified/)
  assert.match(redundantReadyExecuteActivity ?? '', /frontend analysis input source=bridge/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate(() => {
    window.__codexHookPlanPromise = window.__wasmTinygoTestHooks.plan()
  })
  await page.waitForFunction(
    () =>
      document.querySelector('[data-action="plan"]')?.disabled === true &&
      document.querySelector('[data-action="execute"]')?.disabled === true &&
      document.querySelector('[data-action="reset"]')?.disabled === true,
    null,
    { timeout: 120000 },
  )
  const hookPlanLockedState = await page.evaluate(() => ({
    plan: document.querySelector('[data-action="plan"]')?.disabled ?? null,
    execute: document.querySelector('[data-action="execute"]')?.disabled ?? null,
    reset: document.querySelector('[data-action="reset"]')?.disabled ?? null,
  }))
  await page.evaluate(async () => await window.__codexHookPlanPromise)
  const hookPlanUnlockedState = await page.evaluate(() => ({
    plan: document.querySelector('[data-action="plan"]')?.disabled ?? null,
    execute: document.querySelector('[data-action="execute"]')?.disabled ?? null,
    reset: document.querySelector('[data-action="reset"]')?.disabled ?? null,
  }))
  assert.deepEqual(hookPlanLockedState, { plan: true, execute: true, reset: true })
  assert.deepEqual(hookPlanUnlockedState, { plan: false, execute: false, reset: false })

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  const busyUiPlanPageErrorStart = pageErrors.length
  await page.evaluate(() => {
    window.__codexUnhandledRejections = []
  })
  await page.evaluate(() => {
    document.querySelector('[data-action="plan"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    document.querySelector('[data-action="plan"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForFunction(
    () => !document.querySelector('[data-action="plan"]')?.disabled,
    null,
    { timeout: 120000 },
  )
  const busyUiPlanPhases = await page.locator('[data-phase]').allTextContents()
  const busyUiPlanActivity = await page.locator('#terminal-output').textContent()
  const busyUiPlanUnhandledRejections = await page.evaluate(() => window.__codexUnhandledRejections)
  assert.deepEqual(pageErrors.slice(busyUiPlanPageErrorStart), [])
  assert.deepEqual(busyUiPlanUnhandledRejections, [])
  assert.match(busyUiPlanPhases.join('\n'), /build driver plan\s+\d+ steps/)
  assert.doesNotMatch(busyUiPlanActivity ?? '', /build driver failed:/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate(() => {
    window.__codexUnhandledRejections = []
  })
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), invalidBrowserWorkspaceFiles)
  await page.evaluate(() => {
    document.querySelector('[data-action="plan"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForFunction(
    () => !document.querySelector('[data-action="plan"]')?.disabled,
    null,
    { timeout: 120000 },
  )
  const failingUiPlanUnhandledRejections = await page.evaluate(() => window.__codexUnhandledRejections)
  const failingUiPlanPhases = await page.locator('[data-phase]').allTextContents()
  const failingUiPlanActivity = await page.locator('#terminal-output').textContent()
  assert.deepEqual(failingUiPlanUnhandledRejections, [])
  assert.match(failingUiPlanPhases.join('\n'), /build driver plan\s+failed/)
  assert.match(failingUiPlanActivity ?? '', /build driver failed:/)
  assert.match(failingUiPlanActivity ?? '', /local module import package not found/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  const failingUiExecutePageErrorStart = pageErrors.length
  await page.evaluate(() => {
    window.__codexUnhandledRejections = []
  })
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driftedAnalysisInputBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  await page.evaluate(() => {
    document.querySelector('[data-action="execute"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForFunction(
    () => !document.querySelector('[data-action="execute"]')?.disabled,
    null,
    { timeout: 120000 },
  )
  const failingUiExecuteUnhandledRejections = await page.evaluate(() => window.__codexUnhandledRejections)
  const failingUiExecutePhases = await page.locator('[data-phase]').allTextContents()
  const failingUiExecuteActivity = await page.locator('#terminal-output').textContent()
  assert.deepEqual(pageErrors.slice(failingUiExecutePageErrorStart), [])
  assert.deepEqual(failingUiExecuteUnhandledRejections, [])
  assert.match(failingUiExecutePhases.join('\n'), /build execution\s+failed/)
  assert.match(failingUiExecutePhases.join('\n'), /front-end verification\s+failed/)
  assert.match(failingUiExecuteActivity ?? '', /build execution failed: frontend analysis input did not match real TinyGo driver bridge/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  const mixedPlanMutationError = await page.evaluate(async (workspaceFiles) => {
    document.querySelector('[data-action="plan"]')?.click()
    let mutationError = null
    try {
      window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles)
    } catch (error) {
      mutationError = error instanceof Error ? error.message : String(error)
    }
    while (document.querySelector('[data-action="plan"]')?.disabled) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return mutationError
  }, invalidBrowserWorkspaceFiles)
  const mixedPlanMutationPhases = await page.locator('[data-phase]').allTextContents()
  const mixedPlanMutationActivity = await page.locator('#terminal-output').textContent()
  assert.match(mixedPlanMutationError ?? '', /wasm-tinygo test hook action already running: planning/)
  assert.match(mixedPlanMutationPhases.join('\n'), /build driver plan\s+\d+ steps/)
  assert.doesNotMatch(mixedPlanMutationActivity ?? '', /build driver failed:/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  const concurrentPlanMutationError = await page.evaluate(async (workspaceFiles) => {
    const planPromise = window.__wasmTinygoTestHooks.plan()
    let mutationError = null
    try {
      window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles)
    } catch (error) {
      mutationError = error instanceof Error ? error.message : String(error)
    }
    await planPromise
    return mutationError
  }, invalidBrowserWorkspaceFiles)
  assert.match(concurrentPlanMutationError ?? '', /wasm-tinygo test hook action already running: planning/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate(() => window.__wasmTinygoTestHooks.plan())
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), invalidBrowserWorkspaceFiles)
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())

  const invalidatedPlanFrontendAnalysisInputManifest = await page.evaluate(
    () => window.__wasmTinygoTestHooks.readFrontendAnalysisInputManifest(),
  )
  const invalidatedPlanPhases = await page.locator('[data-phase]').allTextContents()
  const invalidatedPlanActivity = await page.locator('#terminal-output').textContent()
  assert.equal(invalidatedPlanFrontendAnalysisInputManifest, null)
  assert.match(invalidatedPlanPhases.join('\n'), /build driver plan\s+failed/)
  assert.match(invalidatedPlanPhases.join('\n'), /build execution\s+failed/)
  assert.match(invalidatedPlanActivity ?? '', /build driver failed:/)
  assert.match(invalidatedPlanActivity ?? '', /local module import package not found/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.plan())
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  const invalidatedOverrideResetPhases = await page.locator('[data-phase]').allTextContents()
  assert.match(invalidatedOverrideResetPhases.join('\n'), /emception worker\s+idle/)
  assert.match(invalidatedOverrideResetPhases.join('\n'), /build driver plan\s+idle/)
  assert.match(invalidatedOverrideResetPhases.join('\n'), /build execution\s+idle/)
  assert.match(invalidatedOverrideResetPhases.join('\n'), /front-end verification\s+idle/)
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())

  const invalidatedOverridePhases = await page.locator('[data-phase]').allTextContents()
  const invalidatedOverrideActivity = await page.locator('#terminal-output').textContent()
  assert.match(invalidatedOverridePhases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(invalidatedOverridePhases.join('\n'), /front-end verification\s+verified/)
  assert.match(invalidatedOverrideActivity ?? '', /driver tinygo-style planner validated target=wasm optimize=-Oz scheduler=asyncify panic=trap/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  const uiExecuteMutationError = await page.evaluate(async (workspaceFiles) => {
    document.querySelector('[data-action="execute"]')?.click()
    let mutationError = null
    try {
      window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles)
    } catch (error) {
      mutationError = error instanceof Error ? error.message : String(error)
    }
    while (document.querySelector('[data-action="execute"]')?.disabled) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return mutationError
  }, invalidBrowserWorkspaceFiles)
  await page.waitForFunction(
    () => /verified|failed/.test(document.querySelector('[data-phase="verify"] .phase-value')?.textContent ?? ''),
    null,
    { timeout: 120000 },
  )
  const uiExecuteMutationPhases = await page.locator('[data-phase]').allTextContents()
  assert.match(uiExecuteMutationError ?? '', /wasm-tinygo test hook action already running: executing/)
  assert.match(uiExecuteMutationPhases.join('\n'), /build driver plan\s+\d+ steps/)
  assert.match(uiExecuteMutationPhases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(uiExecuteMutationPhases.join('\n'), /front-end verification\s+verified/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())
  const repeatedExecuteFrontendAnalysisInputManifest = await page.evaluate(
    () => window.__wasmTinygoTestHooks.readFrontendAnalysisInputManifest(),
  )
  const repeatedExecutePhases = await page.locator('[data-phase]').allTextContents()
  const repeatedExecuteActivity = await page.locator('#terminal-output').textContent()
  assert.deepEqual(repeatedExecuteFrontendAnalysisInputManifest, driverBridgeManifest.frontendAnalysisInput)
  assert.match(repeatedExecutePhases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(repeatedExecutePhases.join('\n'), /front-end verification\s+verified/)
  assert.equal((repeatedExecuteActivity?.match(/frontend analysis input source=bridge/g) ?? []).length, 2)
  assert.equal((repeatedExecuteActivity?.match(/frontend final artifact compiled module=ok/g) ?? []).length, 2)
  assert.doesNotMatch(repeatedExecuteActivity ?? '', /build execution failed: FS error/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  const concurrentExecuteStatuses = await page.evaluate(async ({ workspaceFiles, manifest }) => {
    window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' })
    window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles)
    window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest)
    await window.__wasmTinygoTestHooks.boot()
    const settled = await Promise.allSettled([
      window.__wasmTinygoTestHooks.execute(),
      window.__wasmTinygoTestHooks.execute(),
    ])
    return settled.map((result) => {
      if (result.status === 'fulfilled') {
        return 'fulfilled'
      }
      return result.reason instanceof Error ? result.reason.message : String(result.reason)
    })
  }, { workspaceFiles: browserWorkspaceFiles, manifest: driverBridgeManifest })
  const concurrentExecutePhases = await page.locator('[data-phase]').allTextContents()
  const concurrentExecuteActivity = await page.locator('#terminal-output').textContent()
  assert.deepEqual(concurrentExecuteStatuses, ['fulfilled', 'wasm-tinygo test hook action already running: executing'])
  assert.match(concurrentExecutePhases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(concurrentExecutePhases.join('\n'), /front-end verification\s+verified/)
  assert.doesNotMatch(concurrentExecuteActivity ?? '', /build execution failed: FS error/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  const delayedUiExecuteMutationError = await page.evaluate((workspaceFiles) => new Promise((resolve) => {
    document.querySelector('[data-action="execute"]')?.click()
    setTimeout(() => {
      try {
        window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles)
        resolve(null)
      } catch (error) {
        resolve(error instanceof Error ? error.message : String(error))
      }
    }, 0)
  }), invalidBrowserWorkspaceFiles)
  await page.waitForFunction(
    () => !document.querySelector('[data-action="execute"]')?.disabled,
    null,
    { timeout: 120000 },
  )

  const delayedInvalidationFrontendAnalysisInputManifest = await page.evaluate(
    () => window.__wasmTinygoTestHooks.readFrontendAnalysisInputManifest(),
  )
  const delayedInvalidationPhases = await page.locator('[data-phase]').allTextContents()
  const delayedInvalidationActivity = await page.locator('#terminal-output').textContent()
  assert.match(delayedUiExecuteMutationError ?? '', /wasm-tinygo test hook action already running: executing/)
  assert.deepEqual(delayedInvalidationFrontendAnalysisInputManifest, driverBridgeManifest.frontendAnalysisInput)
  assert.match(delayedInvalidationPhases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(delayedInvalidationPhases.join('\n'), /front-end verification\s+verified/)
  assert.match(delayedInvalidationActivity ?? '', /frontend analysis input source=bridge/)
  assert.doesNotMatch(delayedInvalidationActivity ?? '', /build driver failed:/)

  await page.getByRole('button', { name: 'Reset Log' }).click()
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  const forcedResetBaselineActivity = await page.locator('#terminal-output').textContent()
  await page.evaluate(() => {
    document.querySelector('[data-action="execute"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    document.querySelector('[data-action="reset"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForFunction(
    () => !document.querySelector('[data-action="execute"]')?.disabled,
    null,
    { timeout: 120000 },
  )

  const forcedResetFrontendAnalysisInputManifest = await page.evaluate(
    () => window.__wasmTinygoTestHooks.readFrontendAnalysisInputManifest(),
  )
  const forcedResetPhases = await page.locator('[data-phase]').allTextContents()
  const forcedResetActivity = await page.locator('#terminal-output').textContent()
  assert.deepEqual(forcedResetFrontendAnalysisInputManifest, driverBridgeManifest.frontendAnalysisInput)
  assert.match(forcedResetPhases.join('\n'), /emception worker\s+ready/)
  assert.match(forcedResetPhases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(forcedResetPhases.join('\n'), /front-end verification\s+verified/)
  assert.equal(forcedResetActivity?.startsWith(forcedResetBaselineActivity ?? ''), true)
  assert.match(forcedResetActivity ?? '', /frontend analysis input source=bridge/)

  await page.goto(previewUrl, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(
    () =>
      typeof window.__wasmTinygoTestHooks?.boot === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setBuildRequestOverrides === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setDriverBridgeManifest === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setWorkspaceFiles === 'function',
    null,
    { timeout: 120000 },
  )
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), aliasOnlyDriverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  await page.evaluate(() => window.__wasmTinygoTestHooks.plan())
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())

  const aliasOnlyActivity = await page.locator('#terminal-output').textContent()
  assert.match(aliasOnlyActivity ?? '', /frontend real adapter bridge verified target=wasm llvm=wasm32-unknown-wasi groups=4 compileUnits=[1-9]\d* allCompile=[1-9]\d* alias=direct source=compat-alias/)

  await page.goto(previewUrl, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(
    () =>
      typeof window.__wasmTinygoTestHooks?.boot === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setBuildRequestOverrides === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setDriverBridgeManifest === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setWorkspaceFiles === 'function',
    null,
    { timeout: 120000 },
  )
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driftedAnalysisInputBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  await page.evaluate(() => window.__wasmTinygoTestHooks.plan())
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())

  const driftedAnalysisInputPhases = await page.locator('[data-phase]').allTextContents()
  const driftedAnalysisInputActivity = await page.locator('#terminal-output').textContent()
  assert.match(driftedAnalysisInputPhases.join('\n'), /build execution\s+failed/)
  assert.match(driftedAnalysisInputPhases.join('\n'), /front-end verification\s+failed/)
  assert.match(driftedAnalysisInputActivity ?? '', /build execution failed: frontend analysis input did not match real TinyGo driver bridge/)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())
  const recoveredFrontendAnalysisInputManifest = await page.evaluate(
    () => window.__wasmTinygoTestHooks.readFrontendAnalysisInputManifest(),
  )
  const recoveredPhases = await page.locator('[data-phase]').allTextContents()
  const recoveredActivity = await page.locator('#terminal-output').textContent()
  assert.deepEqual(
    recoveredFrontendAnalysisInputManifest,
    driverBridgeManifest.frontendAnalysisInput,
    JSON.stringify({ recoveredPhases, recoveredActivity }),
  )
  assert.match(recoveredPhases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(recoveredPhases.join('\n'), /front-end verification\s+verified/)
  assert.match(recoveredActivity ?? '', /build execution failed: frontend analysis input did not match real TinyGo driver bridge/)
  assert.match(recoveredActivity ?? '', /frontend analysis input source=bridge/)

  await page.goto(previewUrl, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(
    () =>
      typeof window.__wasmTinygoTestHooks?.boot === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setBuildRequestOverrides === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setDriverBridgeManifest === 'function' &&
      typeof window.__wasmTinygoTestHooks?.setWorkspaceFiles === 'function',
    null,
    { timeout: 120000 },
  )
  await page.evaluate(() => window.__wasmTinygoTestHooks.setBuildRequestOverrides({ scheduler: 'asyncify' }))
  await page.evaluate((workspaceFiles) => window.__wasmTinygoTestHooks.setWorkspaceFiles(workspaceFiles), browserWorkspaceFiles)
  await page.evaluate((manifest) => window.__wasmTinygoTestHooks.setDriverBridgeManifest(manifest), driftedDriverBridgeManifest)
  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  await page.evaluate(() => window.__wasmTinygoTestHooks.plan())
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())

  const driftedPhases = await page.locator('[data-phase]').allTextContents()
  const driftedActivity = await page.locator('#terminal-output').textContent()
  assert.match(driftedPhases.join('\n'), /build execution\s+failed/)
  assert.match(driftedPhases.join('\n'), /front-end verification\s+failed/)
  assert.match(driftedActivity ?? '', /build execution failed: frontend analysis buildContext did not match real TinyGo driver bridge/)
})
