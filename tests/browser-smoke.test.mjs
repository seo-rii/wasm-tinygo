import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'node:net'
import { chromium } from 'playwright'

test('browser smoke completes TinyGo bootstrap flow through test hooks', { timeout: 600000 }, async (t) => {
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
  preview.stdout.on('data', (chunk) => {
    previewOutput += chunk.toString()
  })
  preview.stderr.on('data', (chunk) => {
    previewOutput += chunk.toString()
  })

  let previewReady = false
  for (let index = 0; index < 120; index += 1) {
    if (previewOutput.includes('http://127.0.0.1:4175/')) {
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

  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4175/', { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(
    () => typeof window.__wasmTinygoTestHooks?.boot === 'function',
    null,
    { timeout: 120000 },
  )

  await page.evaluate(() => window.__wasmTinygoTestHooks.boot())
  await page.evaluate(() => window.__wasmTinygoTestHooks.plan())
  await page.evaluate(() => window.__wasmTinygoTestHooks.execute())

  const phases = await page.locator('[data-phase]').allTextContents()
  const activity = await page.locator('#terminal-output').textContent()
  const sourcePreview = await page.locator('.source-panel').first().textContent()

  assert.match(phases.join('\n'), /emception worker\s+ready/)
  assert.match(phases.join('\n'), /build driver plan\s+\d+ steps/)
  assert.match(phases.join('\n'), /build execution\s+[\d,]+ bytes/)
  assert.match(phases.join('\n'), /front-end verification\s+verified/)
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
  assert.match(activity ?? '', /frontend lowered probe verified units=\d+ kinds=\d+ hashes=\d+ imports=\d+ importPaths=\d+ blankImports=\d+ dotImports=\d+ aliasedImports=\d+ funcs=\d+ funcNameHashes=\d+ funcLiterals=\d+ funcParameters=\d+ funcResults=\d+ variadicParameters=\d+ namedResults=\d+ typeParameters=\d+ genericFunctions=\d+ genericTypes=\d+ calls=\d+ builtinCalls=\d+ appendCalls=\d+ lenCalls=\d+ makeCalls=\d+ capCalls=\d+ copyCalls=\d+ panicCalls=\d+ recoverCalls=\d+ newCalls=\d+ deleteCalls=\d+ compositeLiterals=\d+ selectorExpressions=\d+ selectorNameHashes=\d+ indexExpressions=\d+ sliceExpressions=\d+ keyValueExpressions=\d+ typeAssertions=\d+ blankIdentifiers=\d+ blankAssignmentTargets=\d+ unaryExpressions=\d+ binaryExpressions=\d+ sends=\d+ receives=\d+ assignments=\d+ defines=\d+ increments=\d+ decrements=\d+ returns=\d+ goStatements=\d+ deferStatements=\d+ ifStatements=\d+ rangeStatements=\d+ switchStatements=\d+ typeSwitchStatements=\d+ typeSwitchCases=\d+ typeSwitchGuardNameHashes=\d+ typeSwitchCaseTypeHashes=\d+ selectStatements=\d+ switchCases=\d+ selectClauses=\d+ forStatements=\d+ breakStatements=\d+ breakLabelNameHashes=\d+ continueStatements=\d+ continueLabelNameHashes=\d+ labels=\d+ labelNameHashes=\d+ gotos=\d+ gotoLabelNameHashes=\d+ fallthroughs=\d+ methods=\d+ methodNameHashes=\d+ methodSignatureHashes=\d+ exportedMethodNameHashes=\d+ exportedMethodSignatureHashes=\d+ exports=\d+ exportedFunctionNameHashes=\d+ types=\d+ typeNameHashes=\d+ exportedTypes=\d+ exportedTypeNameHashes=\d+ structs=\d+ interfaces=\d+ mapTypes=\d+ chanTypes=\d+ sendOnlyChanTypes=\d+ receiveOnlyChanTypes=\d+ arrayTypes=\d+ sliceTypes=\d+ pointerTypes=\d+ structFields=\d+ embeddedStructFields=\d+ taggedStructFields=\d+ structFieldNameHashes=\d+ structFieldTypeHashes=\d+ embeddedStructFieldTypeHashes=\d+ taggedStructFieldTagHashes=\d+ interfaceMethods=\d+ interfaceMethodNameHashes=\d+ interfaceMethodSignatureHashes=\d+ embeddedInterfaceMethods=\d+ embeddedInterfaceMethodNameHashes=\d+ consts=\d+ constNameHashes=\d+ vars=\d+ varNameHashes=\d+ exportedConsts=\d+ exportedConstNameHashes=\d+ exportedVars=\d+ exportedVarNameHashes=\d+ declarationCounts=\d+ declarationNameHashes=\d+ declarationSignatureHashes=\d+ declarationKindHashes=\d+ declarationExportedCounts=\d+ declarationExportedNameHashes=\d+ declarationExportedSignatureHashes=\d+ declarationExportedKindHashes=\d+ declarationMethodCounts=\d+ declarationMethodNameHashes=\d+ declarationMethodSignatureHashes=\d+ declarationMethodKindHashes=\d+ placeholderBlocks=\d+ placeholderBlockHashes=\d+ placeholderBlockSignatureHashes=\d+ placeholderBlockRuntimeHashes=\d+ loweringBlocks=\d+ loweringBlockHashes=\d+ loweringBlockRuntimeHashes=\d+ mains=\d+ inits=\d+/)
  assert.doesNotMatch(activity ?? '', /bootstrap exports checksum=/)
  assert.doesNotMatch(activity ?? '', /bootstrap exports manifestBytes=/)
  assert.doesNotMatch(activity ?? '', /frontend input target=/)
  assert.doesNotMatch(sourcePreview ?? '', /\/working\/tinygo-bootstrap\.json/)
  assert.doesNotMatch(sourcePreview ?? '', /\/working\/tinygo-frontend-input\.json/)
})
