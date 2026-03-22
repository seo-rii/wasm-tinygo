import test from 'node:test'
import assert from 'node:assert/strict'

import {
  verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest,
  verifyBackendInputManifestAgainstLoweringPlanAndLoweredSourcesManifest,
  buildLoweredBitcodeCompileCommandsFromLoweringPlanAndLoweredSourcesManifest,
  buildToolPlanFromCompileUnitManifest,
  verifyCommandBatchAgainstBackendInputManifest,
  verifyCommandArtifactManifestAgainstBackendInputAndLoweredBitcodeManifest,
  verifyCommandArtifactManifestAgainstCommandBatchAndLoweredBitcodeManifest,
  verifyLoweredArtifactManifestAgainstLoweredCommandBatchManifest,
  verifyLoweredBitcodeManifestAgainstLoweringPlanAndLoweredSourcesManifest,
  verifyLoweredCommandBatchAgainstCompileUnitAndLoweredSourcesManifest,
  verifyLoweredSourcesManifestAgainstWorkItemsManifest,
  verifyCommandBatchAgainstLoweringPlanAndLoweredSourcesManifest,
  verifyLoweringManifestAgainstIntermediateManifest,
  verifyIntermediateManifestAgainstCompileUnitManifest,
  verifyCompileUnitManifestAgainstCompileRequest,
  verifyLoweringPlanAgainstWorkItemsManifest,
  verifyWorkItemsManifestAgainstLoweringManifest,
} from '../src/compile-unit.ts'

test('buildToolPlanFromCompileUnitManifest derives a 2-step clang/wasm-ld plan', () => {
  const toolPlan = buildToolPlanFromCompileUnitManifest({
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
  })

  assert.deepEqual(toolPlan, [
    {
      argv: [
        '/usr/bin/clang',
        '--target=wasm32-unknown-wasi',
        '-Oz',
        '-mbulk-memory',
        '-mnontrapping-fptoint',
        '-mno-multivalue',
        '-mno-reference-types',
        '-msign-ext',
        '-c',
        'tinygo-bootstrap.c',
        '-o',
        'tinygo-bootstrap.o',
      ],
      cwd: '/working',
    },
    {
      argv: [
        '/usr/bin/wasm-ld',
        '--stack-first',
        '--no-demangle',
        '--no-entry',
        '--export-all',
        'tinygo-bootstrap.o',
        '-o',
        '/working/out.wasm',
      ],
      cwd: '/working',
    },
  ])
})

test('verifyCompileUnitManifestAgainstCompileRequest accepts compile requests that omit duplicated manifest metadata and returns the manifest-derived plan', () => {
  const verification = verifyCompileUnitManifestAgainstCompileRequest({
    optimizeFlag: '-Oz',
    materializedFiles: [
      '/working/.tinygo-root/src/device/arm/arm.go',
      '/working/.tinygo-root/src/fmt/print.go',
      '/working/.tinygo-root/src/runtime/runtime.go',
      '/working/.tinygo-root/targets/wasm.json',
      '/working/tinygo-bootstrap.c',
      '/working/tinygo-compile-unit.json',
    ],
    entryFile: '/workspace/main.go',
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: [
        '/working/.tinygo-root/src/fmt/print.go',
        '/workspace/lib/helper.go',
        '/workspace/main.go',
      ],
    },
  }, {
    targetAssetFiles: ['/working/.tinygo-root/targets/wasm.json'],
    runtimeSupportFiles: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
  })

  assert.equal(verification.summary.programCount, 1)
  assert.equal(verification.summary.importedCount, 1)
  assert.equal(verification.summary.stdlibCount, 1)
  assert.equal(verification.summary.allCompileCount, 3)
  assert.deepEqual(verification.toolPlan, [
    {
      argv: [
        '/usr/bin/clang',
        '--target=wasm32-unknown-wasi',
        '-Oz',
        '-mbulk-memory',
        '-mnontrapping-fptoint',
        '-mno-multivalue',
        '-mno-reference-types',
        '-msign-ext',
        '-c',
        'tinygo-bootstrap.c',
        '-o',
        'tinygo-bootstrap.o',
      ],
      cwd: '/working',
    },
    {
      argv: [
        '/usr/bin/wasm-ld',
        '--stack-first',
        '--no-demangle',
        '--no-entry',
        '--export-all',
        'tinygo-bootstrap.o',
        '-o',
        '/working/out.wasm',
      ],
      cwd: '/working',
    },
  ])
})

test('verifyCompileUnitManifestAgainstCompileRequest rejects mismatched tool plans', () => {
  assert.throws(() => verifyCompileUnitManifestAgainstCompileRequest({
    optimizeFlag: '-Oz',
    entryFile: '/workspace/main.go',
    materializedFiles: [
      '/working/.tinygo-root/targets/wasm.json',
      '/working/tinygo-bootstrap.c',
      '/working/tinygo-compile-unit.json',
    ],
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: ['/workspace/main.go'],
    },
  }, {
    toolPlan: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi'],
        cwd: '/working',
      },
    ],
  }), /frontend compile unit tool plan did not match compile request/)
})

test('verifyCompileUnitManifestAgainstCompileRequest rejects legacy top-level toolchain fields even when nested toolchain exists', () => {
  assert.throws(() => verifyCompileUnitManifestAgainstCompileRequest({
    optimizeFlag: '-Oz',
    entryFile: '/workspace/main.go',
    target: 'wasm',
    materializedFiles: [
      '/working/.tinygo-root/targets/wasm.json',
      '/working/tinygo-bootstrap.c',
      '/working/tinygo-compile-unit.json',
    ],
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: ['/workspace/main.go'],
    },
  }, {}), /frontend compile unit legacy top-level toolchain fields are not supported/)
})

test('verifyCompileUnitManifestAgainstCompileRequest rejects legacy top-level source-file groups without nested sourceSelection', () => {
  assert.throws(() => verifyCompileUnitManifestAgainstCompileRequest({
    optimizeFlag: '-Oz',
    entryFile: '/workspace/main.go',
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    programFiles: ['/workspace/main.go'],
    importedPackageFiles: ['/workspace/lib/helper.go'],
    stdlibPackageFiles: ['/working/.tinygo-root/src/fmt/print.go'],
    allCompileFiles: [
      '/working/.tinygo-root/src/fmt/print.go',
      '/workspace/lib/helper.go',
      '/workspace/main.go',
    ],
  }, {}), /frontend compile unit legacy top-level source-file groups are not supported/)
})

test('verifyCompileUnitManifestAgainstCompileRequest rejects legacy top-level source-file groups even when normalized sourceSelection exists', () => {
  assert.throws(() => verifyCompileUnitManifestAgainstCompileRequest({
    optimizeFlag: '-Oz',
    entryFile: '/workspace/main.go',
    materializedFiles: [
      '/working/.tinygo-root/targets/wasm.json',
      '/working/tinygo-bootstrap.c',
      '/working/tinygo-compile-unit.json',
    ],
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: ['/workspace/main.go'],
    },
    programFiles: ['/workspace/main.go'],
  }, {}), /frontend compile unit legacy top-level source-file groups are not supported/)
})

test('verifyIntermediateManifestAgainstCompileUnitManifest accepts a resolved intermediate manifest', () => {
  const verification = verifyIntermediateManifestAgainstCompileUnitManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    materializedFiles: [
      '/working/.tinygo-root/src/device/arm/arm.go',
      '/working/.tinygo-root/src/fmt/print.go',
      '/working/.tinygo-root/src/runtime/runtime.go',
      '/working/.tinygo-root/targets/wasm.json',
      '/working/tinygo-bootstrap.c',
      '/working/tinygo-compile-unit.json',
    ],
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: [
        '/working/.tinygo-root/src/fmt/print.go',
        '/workspace/lib/helper.go',
        '/workspace/main.go',
      ],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
      program: ['/workspace/main.go'],
      imported: ['/workspace/lib/helper.go'],
      stdlib: ['/working/.tinygo-root/src/fmt/print.go'],
      allCompile: [
        '/working/.tinygo-root/src/fmt/print.go',
        '/workspace/lib/helper.go',
        '/workspace/main.go',
      ],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'] },
      { kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'] },
      { kind: 'stdlib', packageDir: '/working/.tinygo-root/src/fmt', files: ['/working/.tinygo-root/src/fmt/print.go'] },
    ],
  })

  assert.equal(verification.toolchain.target, 'wasm')
  assert.equal(verification.sourceSelection.program.length, 1)
  assert.equal(verification.sourceSelection.imported.length, 1)
  assert.equal(verification.sourceSelection.stdlib.length, 1)
  assert.deepEqual(verification.compileUnits, [
    { kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'] },
    { kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'] },
    { kind: 'stdlib', packageDir: '/working/.tinygo-root/src/fmt', files: ['/working/.tinygo-root/src/fmt/print.go'] },
  ])
})

test('verifyIntermediateManifestAgainstCompileUnitManifest rejects mismatched intermediate toolchain', () => {
  assert.throws(() => verifyIntermediateManifestAgainstCompileUnitManifest({
    entryFile: '/workspace/main.go',
    materializedFiles: [
      '/working/.tinygo-root/targets/wasm.json',
      '/working/tinygo-bootstrap.c',
      '/working/tinygo-compile-unit.json',
    ],
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: ['/workspace/main.go'],
    },
  }, {
    entryFile: '/workspace/main.go',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'clang',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: [],
      program: ['/workspace/main.go'],
      imported: [],
      stdlib: [],
      allCompile: ['/workspace/main.go'],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace/lib', files: ['/workspace/main.go'] },
    ],
  }), /frontend intermediate toolchain did not match compile unit manifest/)
})

test('verifyIntermediateManifestAgainstCompileUnitManifest rejects mismatched intermediate compile units', () => {
  assert.throws(() => verifyIntermediateManifestAgainstCompileUnitManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    materializedFiles: [
      '/working/.tinygo-root/src/device/arm/arm.go',
      '/working/.tinygo-root/src/fmt/print.go',
      '/working/.tinygo-root/src/runtime/runtime.go',
      '/working/.tinygo-root/targets/wasm.json',
      '/working/tinygo-bootstrap.c',
      '/working/tinygo-compile-unit.json',
    ],
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: [
        '/working/.tinygo-root/src/fmt/print.go',
        '/workspace/lib/helper.go',
        '/workspace/main.go',
      ],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
      program: ['/workspace/main.go'],
      imported: ['/workspace/lib/helper.go'],
      stdlib: ['/working/.tinygo-root/src/fmt/print.go'],
      allCompile: [
        '/working/.tinygo-root/src/fmt/print.go',
        '/workspace/lib/helper.go',
        '/workspace/main.go',
      ],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'] },
      { kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'] },
      { kind: 'stdlib', packageDir: '/working/.tinygo-root/src/unsafe', files: ['/working/.tinygo-root/src/fmt/print.go'] },
    ],
  }), /frontend intermediate compile units did not match compile unit manifest/)
})

test('verifyLoweringManifestAgainstIntermediateManifest accepts a normalized lowering manifest', () => {
  const verification = verifyLoweringManifestAgainstIntermediateManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
      program: ['/workspace/main.go'],
      imported: ['/workspace/lib/helper.go'],
      stdlib: ['/working/.tinygo-root/src/fmt/print.go'],
      allCompile: [
        '/working/.tinygo-root/src/fmt/print.go',
        '/workspace/lib/helper.go',
        '/workspace/main.go',
      ],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'] },
      { kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'] },
      { kind: 'stdlib', packageDir: '/working/.tinygo-root/src/fmt', files: ['/working/.tinygo-root/src/fmt/print.go'] },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    support: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'] },
      { kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'] },
      { kind: 'stdlib', packageDir: '/working/.tinygo-root/src/fmt', files: ['/working/.tinygo-root/src/fmt/print.go'] },
    ],
  })

  assert.deepEqual(verification.support, {
    targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
    runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
  })
  assert.equal(verification.compileUnits.length, 3)
})

test('verifyLoweringManifestAgainstIntermediateManifest rejects mismatched compile units', () => {
  assert.throws(() => verifyLoweringManifestAgainstIntermediateManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
      program: ['/workspace/main.go'],
      imported: ['/workspace/lib/helper.go'],
      stdlib: ['/working/.tinygo-root/src/fmt/print.go'],
      allCompile: [
        '/working/.tinygo-root/src/fmt/print.go',
        '/workspace/lib/helper.go',
        '/workspace/main.go',
      ],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'] },
      { kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'] },
      { kind: 'stdlib', packageDir: '/working/.tinygo-root/src/fmt', files: ['/working/.tinygo-root/src/fmt/print.go'] },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    support: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace/lib', files: ['/workspace/main.go'] },
    ],
  }), /frontend lowering compile units did not match intermediate manifest/)
})

test('verifyWorkItemsManifestAgainstLoweringManifest accepts a normalized work-item graph', () => {
  const verification = verifyWorkItemsManifestAgainstLoweringManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    support: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'] },
      { kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'] },
      { kind: 'stdlib', packageDir: '/working/.tinygo-root/src/fmt', files: ['/working/.tinygo-root/src/fmt/print.go'] },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    workItems: [
      { id: 'program-000', kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'], bitcodeOutputPath: '/working/tinygo-work/program-000.bc' },
      { id: 'imported-000', kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'], bitcodeOutputPath: '/working/tinygo-work/imported-000.bc' },
      { id: 'stdlib-000', kind: 'stdlib', packageDir: '/working/.tinygo-root/src/fmt', files: ['/working/.tinygo-root/src/fmt/print.go'], bitcodeOutputPath: '/working/tinygo-work/stdlib-000.bc' },
    ],
  })

  assert.equal(verification.workItems.length, 3)
  assert.equal(verification.workItems[0]?.bitcodeOutputPath, '/working/tinygo-work/program-000.bc')
})

test('verifyWorkItemsManifestAgainstLoweringManifest rejects mismatched work-item graphs', () => {
  assert.throws(() => verifyWorkItemsManifestAgainstLoweringManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    support: {
      targetAssets: ['/working/.tinygo-root/targets/wasm.json'],
      runtimeSupport: ['/working/.tinygo-root/src/device/arm/arm.go', '/working/.tinygo-root/src/runtime/runtime.go'],
    },
    compileUnits: [
      { kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'] },
      { kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'] },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    workItems: [
      { id: 'program-000', kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'], bitcodeOutputPath: '/working/tinygo-work/program-001.bc' },
      { id: 'imported-000', kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'], bitcodeOutputPath: '/working/tinygo-work/imported-000.bc' },
    ],
  }), /frontend work items did not match lowering manifest/)
})

test('verifyLoweringPlanAgainstWorkItemsManifest accepts a normalized lowering plan', () => {
  const verification = verifyLoweringPlanAgainstWorkItemsManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    workItems: [
      { id: 'program-000', kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'], bitcodeOutputPath: '/working/tinygo-work/program-000.bc' },
      { id: 'imported-000', kind: 'imported', packageDir: '/workspace/lib', files: ['/workspace/lib/helper.go'], bitcodeOutputPath: '/working/tinygo-work/imported-000.bc' },
      { id: 'stdlib-000', kind: 'stdlib', packageDir: '/working/.tinygo-root/src/fmt', files: ['/working/.tinygo-root/src/fmt/print.go'], bitcodeOutputPath: '/working/tinygo-work/stdlib-000.bc' },
    ],
  }, {
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
        id: 'imported-000',
        kind: 'imported',
        packageDir: '/workspace/lib',
        files: ['/workspace/lib/helper.go'],
        bitcodeOutputPath: '/working/tinygo-work/imported-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
        optimizeFlag: '-Oz',
      },
      {
        id: 'stdlib-000',
        kind: 'stdlib',
        packageDir: '/working/.tinygo-root/src/fmt',
        files: ['/working/.tinygo-root/src/fmt/print.go'],
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
      bitcodeInputs: [
        '/working/tinygo-work/program-000.bc',
        '/working/tinygo-work/imported-000.bc',
        '/working/tinygo-work/stdlib-000.bc',
      ],
    },
  })

  assert.equal(verification.compileJobs.length, 3)
  assert.equal(verification.linkJob.artifactOutputPath, '/working/out.wasm')
})

test('verifyLoweringPlanAgainstWorkItemsManifest rejects mismatched compile jobs', () => {
  assert.throws(() => verifyLoweringPlanAgainstWorkItemsManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      llvmTarget: 'wasm32-unknown-wasi',
      linker: 'wasm-ld',
      cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      translationUnitPath: '/working/tinygo-bootstrap.c',
      objectOutputPath: '/working/tinygo-bootstrap.o',
      artifactOutputPath: '/working/out.wasm',
    },
    workItems: [
      { id: 'program-000', kind: 'program', packageDir: '/workspace', files: ['/workspace/main.go'], bitcodeOutputPath: '/working/tinygo-work/program-000.bc' },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    compileJobs: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-001.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
      bitcodeInputs: ['/working/tinygo-work/program-001.bc'],
    },
  }), /frontend lowering plan compile jobs did not match work items manifest/)
})

test('verifyCommandBatchAgainstLoweringPlanAndLoweredSourcesManifest accepts a normalized command batch', () => {
  const verification = verifyCommandBatchAgainstLoweringPlanAndLoweredSourcesManifest({
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
        packageDir: '/working/.tinygo-root/src/fmt',
        files: ['/working/.tinygo-root/src/fmt/print.go'],
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
      bitcodeInputs: ['/working/tinygo-work/program-000.bc', '/working/tinygo-work/stdlib-000.bc'],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
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
        packageDir: '/working/.tinygo-root/src/fmt',
        sourceFiles: ['/working/.tinygo-root/src/fmt/print.go'],
        loweredSourcePath: '/working/tinygo-lowered/stdlib-000.c',
      },
    ],
  }, {
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
        cwd: '/working',
      },
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-emit-llvm', '-c', '/working/tinygo-lowered/stdlib-000.c', '-o', '/working/tinygo-work/stdlib-000.bc'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '/working/tinygo-work/stdlib-000.bc', '-o', '/working/out.wasm'],
      cwd: '/working',
    },
  })

  assert.equal(verification.compileCommands.length, 2)
  assert.equal(verification.linkCommand.cwd, '/working')
})

test('verifyBackendInputManifestAgainstLoweringPlanAndLoweredSourcesManifest accepts a normalized backend input', () => {
  const verification = verifyBackendInputManifestAgainstLoweringPlanAndLoweredSourcesManifest({
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
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
      bitcodeInputs: ['/working/tinygo-work/program-000.bc'],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        sourceFiles: ['/workspace/main.go'],
        loweredSourcePath: '/working/tinygo-lowered/program-000.c',
      },
    ],
  }, {
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
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  })

  assert.equal(verification.compileJobs.length, 1)
  assert.equal(verification.loweredUnits.length, 1)
  assert.equal(verification.linkJob.artifactOutputPath, '/working/out.wasm')
})

test('verifyBackendInputManifestAgainstLoweringPlanAndLoweredSourcesManifest rejects mismatched derived lowered units', () => {
  assert.throws(() => verifyBackendInputManifestAgainstLoweringPlanAndLoweredSourcesManifest({
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
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
      bitcodeInputs: ['/working/tinygo-work/program-000.bc'],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
      {
        id: 'program-001',
        kind: 'program',
        packageDir: '/workspace',
        sourceFiles: ['/workspace/main.go'],
        loweredSourcePath: '/working/tinygo-lowered/program-001.c',
      },
    ],
  }, {
    entryFile: '/workspace/main.go',
    compileJobs: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }), /frontend backend input did not match lowering plan and lowered sources manifests/)
})

test('verifyCommandBatchAgainstLoweringPlanAndLoweredSourcesManifest rejects mismatched compile commands', () => {
  assert.throws(() => verifyCommandBatchAgainstLoweringPlanAndLoweredSourcesManifest({
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
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        sourceFiles: ['/workspace/main.go'],
        loweredSourcePath: '/working/tinygo-lowered/program-000.c',
      },
    ],
  }, {
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-emit-llvm', '-c', '/working/tinygo-lowered/program-001.c', '-o', '/working/tinygo-work/program-001.bc'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-001.bc', '-o', '/working/out.wasm'],
      cwd: '/working',
    },
  }), /frontend command batch compile commands did not match lowering plan and lowered sources manifests/)
})

test('verifyCommandBatchAgainstBackendInputManifest accepts a normalized backend-owned command batch', () => {
  const verification = verifyCommandBatchAgainstBackendInputManifest({
    entryFile: '/workspace/main.go',
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
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }, {
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '-o', '/working/out.wasm'],
      cwd: '/working',
    },
  })

  assert.equal(verification.compileCommands.length, 1)
  assert.equal(verification.linkCommand.cwd, '/working')
})

test('verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest accepts a normalized backend result', () => {
  const verification = verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest({
    entryFile: '/workspace/main.go',
    compileJobs: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }, {
    bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
  }, {
    ok: true,
    generatedFiles: [
      {
        path: '/working/tinygo-lowered-sources.json',
        contents: JSON.stringify({
          entryFile: '/workspace/main.go',
          optimizeFlag: '-Oz',
          units: [
            {
              id: 'program-000',
              kind: 'program',
              packageDir: '/workspace',
              sourceFiles: ['/workspace/main.go'],
              loweredSourcePath: '/working/tinygo-lowered/program-000.c',
            },
          ],
        }),
      },
      {
        path: '/working/tinygo-lowered-bitcode.json',
        contents: JSON.stringify({
          bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
        }),
      },
      {
        path: '/working/tinygo-lowered/program-000.c',
        contents: '/* lowered */',
      },
      {
        path: '/working/tinygo-lowered-ir.json',
        contents: JSON.stringify({
          entryFile: '/workspace/main.go',
          optimizeFlag: '-Oz',
          units: [
            {
              id: 'program-000',
              kind: 'program',
              packageDir: '/workspace',
              sourceFiles: ['/workspace/main.go'],
              loweredSourcePath: '/working/tinygo-lowered/program-000.c',
              packageName: 'main',
              imports: [],
              functions: [
                {
                  name: 'main',
                  exported: false,
                  method: false,
                  main: true,
                  init: false,
                  parameters: 0,
                  results: 0,
                },
              ],
              types: [],
              constants: [],
              variables: [],
              declarations: [
                {
                  kind: 'function',
                  name: 'main',
                  exported: false,
                  method: false,
                },
              ],
              placeholderBlocks: [
                {
                  stage: 'function',
                  index: 0,
                  value: 'function:main:0:0:1:0:0:0',
                  signature: 'main:0:0:1:0:0:0',
                },
                {
                  stage: 'declaration',
                  index: 0,
                  value: 'declaration:function:main:0:0',
                  signature: 'function:main:0:0',
                },
              ],
              loweringBlocks: [
                {
                  stage: 'function',
                  index: 0,
                  value: 'tinygo_lower_unit_begin("program-000", "program", "main", 1);tinygo_lower_function_begin("main", "main");tinygo_emit_function_index(0);tinygo_emit_function_flags(0, 0, 1, 0);tinygo_emit_function_signature(0, 0);tinygo_emit_function_stream("main:0:0:1:0:0:0");tinygo_lower_function_end();tinygo_lower_unit_end()',
                },
                {
                  stage: 'declaration',
                  index: 0,
                  value: 'tinygo_lower_unit_begin("program-000", "program", "main", 1);tinygo_lower_declaration_begin("main", "function", "main");tinygo_emit_declaration_index(0);tinygo_emit_declaration_flags(0, 0);tinygo_emit_declaration_signature("function:main:0:0");tinygo_lower_declaration_end();tinygo_lower_unit_end()',
                },
              ],
            },
          ],
        }),
      },
      {
        path: '/working/tinygo-lowered-command-batch.json',
        contents: JSON.stringify({
          compileCommands: [
            {
              argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-000.o'],
              cwd: '/working',
            },
          ],
          linkCommand: {
            argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-lowered/program-000.o', '-o', '/working/tinygo-lowered-out.wasm'],
            cwd: '/working',
          },
        }),
      },
      {
        path: '/working/tinygo-lowered-artifact.json',
        contents: JSON.stringify({
          artifactOutputPath: '/working/tinygo-lowered-out.wasm',
          objectFiles: ['/working/tinygo-lowered/program-000.o'],
        }),
      },
      {
        path: '/working/tinygo-command-artifact.json',
        contents: JSON.stringify({
          artifactOutputPath: '/working/out.wasm',
          bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
        }),
      },
      {
        path: '/working/tinygo-command-batch.json',
        contents: JSON.stringify({
          compileCommands: [
            {
              argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
              cwd: '/working',
            },
          ],
          linkCommand: {
            argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '-o', '/working/out.wasm'],
            cwd: '/working',
          },
        }),
      },
    ],
  })

  assert.equal(verification.loweredIR.units[0]?.packageName, 'main')
  assert.equal(verification.commandArtifact.artifactOutputPath, '/working/out.wasm')
  assert.equal(verification.commandBatch.compileCommands.length, 1)
  assert.equal(verification.generatedFiles[0]?.path, '/working/tinygo-lowered-sources.json')
  assert.equal(verification.generatedFiles[3]?.path, '/working/tinygo-lowered-ir.json')
  assert.equal(verification.loweredCommandBatch.compileCommands.length, 1)
  assert.equal(verification.loweredArtifact.objectFiles[0], '/working/tinygo-lowered/program-000.o')
})

test('verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest rejects placeholder blocks without signatures', () => {
  assert.throws(() => verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest({
    entryFile: '/workspace/main.go',
    compileJobs: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }, {
    bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
  }, {
    ok: true,
    generatedFiles: [
      {
        path: '/working/tinygo-lowered-sources.json',
        contents: JSON.stringify({
          entryFile: '/workspace/main.go',
          optimizeFlag: '-Oz',
          units: [
            {
              id: 'program-000',
              kind: 'program',
              packageDir: '/workspace',
              sourceFiles: ['/workspace/main.go'],
              loweredSourcePath: '/working/tinygo-lowered/program-000.c',
            },
          ],
        }),
      },
      {
        path: '/working/tinygo-lowered-bitcode.json',
        contents: JSON.stringify({
          bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
        }),
      },
      {
        path: '/working/tinygo-lowered/program-000.c',
        contents: '/* lowered */',
      },
      {
        path: '/working/tinygo-lowered-ir.json',
        contents: JSON.stringify({
          entryFile: '/workspace/main.go',
          optimizeFlag: '-Oz',
          units: [
            {
              id: 'program-000',
              kind: 'program',
              packageDir: '/workspace',
              sourceFiles: ['/workspace/main.go'],
              loweredSourcePath: '/working/tinygo-lowered/program-000.c',
              packageName: 'main',
              imports: [],
              functions: [
                {
                  name: 'main',
                  exported: false,
                  method: false,
                  main: true,
                  init: false,
                  parameters: 0,
                  results: 0,
                },
              ],
              types: [],
              constants: [],
              variables: [],
              declarations: [
                {
                  kind: 'function',
                  name: 'main',
                  exported: false,
                  method: false,
                },
              ],
              placeholderBlocks: [
                {
                  stage: 'function',
                  index: 0,
                  value: 'function:main:0:0:1:0:0:0',
                },
                {
                  stage: 'declaration',
                  index: 0,
                  value: 'declaration:function:main:0:0',
                },
              ],
              loweringBlocks: [
                {
                  stage: 'function',
                  index: 0,
                  value: 'tinygo_lower_unit_begin("program-000", "program", "main", 1);tinygo_lower_function_begin("main", "main");tinygo_emit_function_index(0);tinygo_emit_function_flags(0, 0, 1, 0);tinygo_emit_function_signature(0, 0);tinygo_emit_function_stream("main:0:0:1:0:0:0");tinygo_lower_function_end();tinygo_lower_unit_end()',
                },
                {
                  stage: 'declaration',
                  index: 0,
                  value: 'tinygo_lower_unit_begin("program-000", "program", "main", 1);tinygo_lower_declaration_begin("main", "function", "main");tinygo_emit_declaration_index(0);tinygo_emit_declaration_flags(0, 0);tinygo_emit_declaration_signature("function:main:0:0");tinygo_lower_declaration_end();tinygo_lower_unit_end()',
                },
              ],
            },
          ],
        }),
      },
      {
        path: '/working/tinygo-lowered-command-batch.json',
        contents: JSON.stringify({
          compileCommands: [
            {
              argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-000.o'],
              cwd: '/working',
            },
          ],
          linkCommand: {
            argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-lowered/program-000.o', '-o', '/working/tinygo-lowered-out.wasm'],
            cwd: '/working',
          },
        }),
      },
      {
        path: '/working/tinygo-lowered-artifact.json',
        contents: JSON.stringify({
          artifactOutputPath: '/working/tinygo-lowered-out.wasm',
          objectFiles: ['/working/tinygo-lowered/program-000.o'],
        }),
      },
      {
        path: '/working/tinygo-command-artifact.json',
        contents: JSON.stringify({
          artifactOutputPath: '/working/out.wasm',
          bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
        }),
      },
      {
        path: '/working/tinygo-command-batch.json',
        contents: JSON.stringify({
          compileCommands: [
            {
              argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
              cwd: '/working',
            },
          ],
          linkCommand: {
            argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '-o', '/working/out.wasm'],
            cwd: '/working',
          },
        }),
      },
    ],
  }), /frontend backend result did not match backend input manifest/)
})

test('verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest rejects lowered IR declarations that do not match symbol summaries', () => {
  assert.throws(() => verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest({
    entryFile: '/workspace/main.go',
    compileJobs: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }, {
    bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
  }, {
    ok: true,
    generatedFiles: [
      {
        path: '/working/tinygo-lowered-sources.json',
        contents: JSON.stringify({
          entryFile: '/workspace/main.go',
          optimizeFlag: '-Oz',
          units: [
            {
              id: 'program-000',
              kind: 'program',
              packageDir: '/workspace',
              sourceFiles: ['/workspace/main.go'],
              loweredSourcePath: '/working/tinygo-lowered/program-000.c',
            },
          ],
        }),
      },
      {
        path: '/working/tinygo-lowered-bitcode.json',
        contents: JSON.stringify({
          bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
        }),
      },
      {
        path: '/working/tinygo-lowered/program-000.c',
        contents: '/* lowered */',
      },
      {
        path: '/working/tinygo-lowered-ir.json',
        contents: JSON.stringify({
          entryFile: '/workspace/main.go',
          optimizeFlag: '-Oz',
          units: [
            {
              id: 'program-000',
              kind: 'program',
              packageDir: '/workspace',
              sourceFiles: ['/workspace/main.go'],
              loweredSourcePath: '/working/tinygo-lowered/program-000.c',
              packageName: 'main',
              imports: [],
              functions: [
                {
                  name: 'main',
                  exported: false,
                  method: false,
                  main: true,
                  init: false,
                  parameters: 0,
                  results: 0,
                },
              ],
              types: [],
              constants: [],
              variables: [],
              declarations: [
                {
                  kind: 'function',
                  name: 'helper',
                  exported: false,
                  method: false,
                },
              ],
            },
          ],
        }),
      },
      {
        path: '/working/tinygo-lowered-command-batch.json',
        contents: JSON.stringify({
          compileCommands: [
            {
              argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-000.o'],
              cwd: '/working',
            },
          ],
          linkCommand: {
            argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-lowered/program-000.o', '-o', '/working/tinygo-lowered-out.wasm'],
            cwd: '/working',
          },
        }),
      },
      {
        path: '/working/tinygo-lowered-artifact.json',
        contents: JSON.stringify({
          artifactOutputPath: '/working/tinygo-lowered-out.wasm',
          objectFiles: ['/working/tinygo-lowered/program-000.o'],
        }),
      },
      {
        path: '/working/tinygo-command-artifact.json',
        contents: JSON.stringify({
          artifactOutputPath: '/working/out.wasm',
          bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
        }),
      },
      {
        path: '/working/tinygo-command-batch.json',
        contents: JSON.stringify({
          compileCommands: [
            {
              argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
              cwd: '/working',
            },
          ],
          linkCommand: {
            argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '-o', '/working/out.wasm'],
            cwd: '/working',
          },
        }),
      },
    ],
  }), /frontend backend result did not match backend input manifest/)
})

test('verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest rejects lowered IR lowering blocks that do not match symbol summaries', () => {
  assert.throws(() => verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest({
    entryFile: '/workspace/main.go',
    compileJobs: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }, {
    bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
  }, {
    ok: true,
    generatedFiles: [
      {
        path: '/working/tinygo-lowered-sources.json',
        contents: JSON.stringify({
          entryFile: '/workspace/main.go',
          optimizeFlag: '-Oz',
          units: [
            {
              id: 'program-000',
              kind: 'program',
              packageDir: '/workspace',
              sourceFiles: ['/workspace/main.go'],
              loweredSourcePath: '/working/tinygo-lowered/program-000.c',
            },
          ],
        }),
      },
      {
        path: '/working/tinygo-lowered-bitcode.json',
        contents: JSON.stringify({
          bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
        }),
      },
      {
        path: '/working/tinygo-lowered/program-000.c',
        contents: '/* lowered */',
      },
      {
        path: '/working/tinygo-lowered-ir.json',
        contents: JSON.stringify({
          entryFile: '/workspace/main.go',
          optimizeFlag: '-Oz',
          units: [
            {
              id: 'program-000',
              kind: 'program',
              packageDir: '/workspace',
              sourceFiles: ['/workspace/main.go'],
              loweredSourcePath: '/working/tinygo-lowered/program-000.c',
              packageName: 'main',
              imports: [],
              functions: [
                {
                  name: 'main',
                  exported: false,
                  method: false,
                  main: true,
                  init: false,
                  parameters: 0,
                  results: 0,
                },
              ],
              types: [],
              constants: [],
              variables: [],
              declarations: [
                {
                  kind: 'function',
                  name: 'main',
                  exported: false,
                  method: false,
                },
              ],
              placeholderBlocks: [
                {
                  stage: 'function',
                  index: 0,
                  value: 'function:main:0:0:1:0:0:0',
                  signature: 'main:0:0:1:0:0:0',
                },
                {
                  stage: 'declaration',
                  index: 0,
                  value: 'declaration:function:main:0:0',
                  signature: 'function:main:0:0',
                },
              ],
              loweringBlocks: [],
            },
          ],
        }),
      },
      {
        path: '/working/tinygo-lowered-command-batch.json',
        contents: JSON.stringify({
          compileCommands: [
            {
              argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-000.o'],
              cwd: '/working',
            },
          ],
          linkCommand: {
            argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-lowered/program-000.o', '-o', '/working/tinygo-lowered-out.wasm'],
            cwd: '/working',
          },
        }),
      },
      {
        path: '/working/tinygo-lowered-artifact.json',
        contents: JSON.stringify({
          artifactOutputPath: '/working/tinygo-lowered-out.wasm',
          objectFiles: ['/working/tinygo-lowered/program-000.o'],
        }),
      },
      {
        path: '/working/tinygo-command-artifact.json',
        contents: JSON.stringify({
          artifactOutputPath: '/working/out.wasm',
          bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
        }),
      },
      {
        path: '/working/tinygo-command-batch.json',
        contents: JSON.stringify({
          compileCommands: [
            {
              argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
              cwd: '/working',
            },
          ],
          linkCommand: {
            argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '-o', '/working/out.wasm'],
            cwd: '/working',
          },
        }),
      },
    ],
  }), /frontend backend result did not match backend input manifest/)
})

test('verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest rejects mismatched backend generated files', () => {
  assert.throws(() => verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest({
    entryFile: '/workspace/main.go',
    compileJobs: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }, {
    bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
  }, {
    ok: true,
    generatedFiles: [
      {
        path: '/working/other.json',
        contents: '{}',
      },
    ],
  }), /frontend backend result did not match backend input manifest/)
})

test('verifyCommandArtifactManifestAgainstBackendInputAndLoweredBitcodeManifest accepts a normalized backend-owned final command artifact', () => {
  const verification = verifyCommandArtifactManifestAgainstBackendInputAndLoweredBitcodeManifest({
    entryFile: '/workspace/main.go',
    compileJobs: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
    },
  }, {
    bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
  }, {
    artifactOutputPath: '/working/out.wasm',
    bitcodeFiles: ['/working/tinygo-work/program-000.bc'],
  })

  assert.equal(verification.artifactOutputPath, '/working/out.wasm')
  assert.deepEqual(verification.bitcodeFiles, ['/working/tinygo-work/program-000.bc'])
})

test('verifyCommandArtifactManifestAgainstCommandBatchAndLoweredBitcodeManifest accepts a normalized final command artifact', () => {
  const verification = verifyCommandArtifactManifestAgainstCommandBatchAndLoweredBitcodeManifest({
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
        cwd: '/working',
      },
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-emit-llvm', '-c', '/working/tinygo-lowered/stdlib-000.c', '-o', '/working/tinygo-work/stdlib-000.bc'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '/working/tinygo-work/stdlib-000.bc', '-o', '/working/out.wasm'],
      cwd: '/working',
    },
  }, {
    bitcodeFiles: [
      '/working/tinygo-work/program-000.bc',
      '/working/tinygo-work/stdlib-000.bc',
    ],
  }, {
    artifactOutputPath: '/working/out.wasm',
    bitcodeFiles: [
      '/working/tinygo-work/program-000.bc',
      '/working/tinygo-work/stdlib-000.bc',
    ],
  })

  assert.equal(verification.artifactOutputPath, '/working/out.wasm')
  assert.deepEqual(verification.bitcodeFiles, [
    '/working/tinygo-work/program-000.bc',
    '/working/tinygo-work/stdlib-000.bc',
  ])
})

test('verifyCommandArtifactManifestAgainstCommandBatchAndLoweredBitcodeManifest rejects mismatched final command artifact', () => {
  assert.throws(() => verifyCommandArtifactManifestAgainstCommandBatchAndLoweredBitcodeManifest({
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-work/program-000.bc', '-o', '/working/out.wasm'],
      cwd: '/working',
    },
  }, {
    bitcodeFiles: [
      '/working/tinygo-work/program-000.bc',
    ],
  }, {
    artifactOutputPath: '/working/out-alt.wasm',
    bitcodeFiles: [
      '/working/tinygo-work/program-000.bc',
    ],
  }), /frontend command artifact manifest did not match command batch and lowered bitcode manifest/)
})

test('buildLoweredBitcodeCompileCommandsFromLoweringPlanAndLoweredSourcesManifest derives executable lowered-source llvm commands', () => {
  const compileCommands = buildLoweredBitcodeCompileCommandsFromLoweringPlanAndLoweredSourcesManifest({
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
        packageDir: '/working/.tinygo-root/src/fmt',
        files: ['/working/.tinygo-root/src/fmt/print.go'],
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
      bitcodeInputs: ['/working/tinygo-work/program-000.bc', '/working/tinygo-work/stdlib-000.bc'],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
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
        packageDir: '/working/.tinygo-root/src/fmt',
        sourceFiles: ['/working/.tinygo-root/src/fmt/print.go'],
        loweredSourcePath: '/working/tinygo-lowered/stdlib-000.c',
      },
    ],
  })

  assert.deepEqual(compileCommands, [
    {
      argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-emit-llvm', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-work/program-000.bc'],
      cwd: '/working',
    },
    {
      argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-emit-llvm', '-c', '/working/tinygo-lowered/stdlib-000.c', '-o', '/working/tinygo-work/stdlib-000.bc'],
      cwd: '/working',
    },
  ])
})

test('buildLoweredBitcodeCompileCommandsFromLoweringPlanAndLoweredSourcesManifest rejects mismatched lowering jobs', () => {
  assert.throws(() => buildLoweredBitcodeCompileCommandsFromLoweringPlanAndLoweredSourcesManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    compileJobs: [
      {
        id: 'program-001',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-001.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
    linkJob: {
      linker: 'wasm-ld',
      ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
      artifactOutputPath: '/working/out.wasm',
      bitcodeInputs: ['/working/tinygo-work/program-001.bc'],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        sourceFiles: ['/workspace/main.go'],
        loweredSourcePath: '/working/tinygo-lowered/program-000.c',
      },
    ],
  }), /frontend lowered bitcode compile commands did not match lowering plan and lowered sources manifests/)
})

test('verifyLoweredBitcodeManifestAgainstLoweringPlanAndLoweredSourcesManifest accepts normalized lowered bitcode outputs', () => {
  const verification = verifyLoweredBitcodeManifestAgainstLoweringPlanAndLoweredSourcesManifest({
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
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
      {
        id: 'stdlib-000',
        kind: 'stdlib',
        packageDir: '/working/.tinygo-root/src/fmt',
        files: ['/working/.tinygo-root/src/fmt/print.go'],
        bitcodeOutputPath: '/working/tinygo-work/stdlib-000.bc',
        llvmTarget: 'wasm32-unknown-wasi',
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
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
        packageDir: '/working/.tinygo-root/src/fmt',
        sourceFiles: ['/working/.tinygo-root/src/fmt/print.go'],
        loweredSourcePath: '/working/tinygo-lowered/stdlib-000.c',
      },
    ],
  }, {
    bitcodeFiles: [
      '/working/tinygo-work/program-000.bc',
      '/working/tinygo-work/stdlib-000.bc',
    ],
  })

  assert.deepEqual(verification.bitcodeFiles, [
    '/working/tinygo-work/program-000.bc',
    '/working/tinygo-work/stdlib-000.bc',
  ])
})

test('verifyLoweredBitcodeManifestAgainstLoweringPlanAndLoweredSourcesManifest rejects mismatched lowered bitcode outputs', () => {
  assert.throws(() => verifyLoweredBitcodeManifestAgainstLoweringPlanAndLoweredSourcesManifest({
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
        cflags: ['-mbulk-memory'],
        optimizeFlag: '-Oz',
      },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        sourceFiles: ['/workspace/main.go'],
        loweredSourcePath: '/working/tinygo-lowered/program-000.c',
      },
    ],
  }, {
    bitcodeFiles: [
      '/working/tinygo-work/program-001.bc',
    ],
  }), /frontend lowered bitcode manifest did not match lowering plan and lowered sources manifests/)
})

test('verifyLoweredSourcesManifestAgainstWorkItemsManifest accepts deterministic lowered source units', () => {
  const verification = verifyLoweredSourcesManifestAgainstWorkItemsManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    workItems: [
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
        packageDir: '/working/.tinygo-root/src/fmt',
        files: ['/working/.tinygo-root/src/fmt/print.go'],
        bitcodeOutputPath: '/working/tinygo-work/stdlib-000.bc',
      },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
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
        packageDir: '/working/.tinygo-root/src/fmt',
        sourceFiles: ['/working/.tinygo-root/src/fmt/print.go'],
        loweredSourcePath: '/working/tinygo-lowered/stdlib-000.c',
      },
    ],
  })

  assert.equal(verification.units.length, 2)
  assert.equal(verification.units[1]?.loweredSourcePath, '/working/tinygo-lowered/stdlib-000.c')
})

test('verifyLoweredSourcesManifestAgainstWorkItemsManifest rejects mismatched lowered units', () => {
  assert.throws(() => verifyLoweredSourcesManifestAgainstWorkItemsManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    workItems: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        files: ['/workspace/main.go'],
        bitcodeOutputPath: '/working/tinygo-work/program-000.bc',
      },
    ],
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        sourceFiles: ['/workspace/main.go'],
        loweredSourcePath: '/working/tinygo-lowered/program-001.c',
      },
    ],
  }), /frontend lowered sources did not match work items manifest/)
})

test('verifyLoweredCommandBatchAgainstCompileUnitAndLoweredSourcesManifest accepts executable lowered-source commands', () => {
  const verification = verifyLoweredCommandBatchAgainstCompileUnitAndLoweredSourcesManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: ['/workspace/main.go'],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
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
        packageDir: '/working/.tinygo-root/src/fmt',
        sourceFiles: ['/working/.tinygo-root/src/fmt/print.go'],
        loweredSourcePath: '/working/tinygo-lowered/stdlib-000.c',
      },
    ],
  }, {
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-000.o'],
        cwd: '/working',
      },
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-c', '/working/tinygo-lowered/stdlib-000.c', '-o', '/working/tinygo-lowered/stdlib-000.o'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-lowered/program-000.o', '/working/tinygo-lowered/stdlib-000.o', '-o', '/working/tinygo-lowered-out.wasm'],
      cwd: '/working',
    },
  })

  assert.equal(verification.compileCommands.length, 2)
  assert.equal(verification.linkCommand.argv.at(-1), '/working/tinygo-lowered-out.wasm')
})

test('verifyLoweredCommandBatchAgainstCompileUnitAndLoweredSourcesManifest rejects mismatched lowered command batches', () => {
  assert.throws(() => verifyLoweredCommandBatchAgainstCompileUnitAndLoweredSourcesManifest({
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    toolchain: {
      target: 'wasm',
      artifactOutputPath: '/working/out.wasm',
    },
    sourceSelection: {
      allCompile: ['/workspace/main.go'],
    },
  }, {
    entryFile: '/workspace/main.go',
    optimizeFlag: '-Oz',
    units: [
      {
        id: 'program-000',
        kind: 'program',
        packageDir: '/workspace',
        sourceFiles: ['/workspace/main.go'],
        loweredSourcePath: '/working/tinygo-lowered/program-000.c',
      },
    ],
  }, {
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-001.o'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '/working/tinygo-lowered/program-001.o', '-o', '/working/tinygo-lowered-out.wasm'],
      cwd: '/working',
    },
  }), /frontend lowered command batch compile commands did not match compile-unit and lowered sources manifests/)
})

test('verifyLoweredArtifactManifestAgainstLoweredCommandBatchManifest accepts normalized lowered artifact metadata', () => {
  const verification = verifyLoweredArtifactManifestAgainstLoweredCommandBatchManifest({
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-000.o'],
        cwd: '/working',
      },
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-c', '/working/tinygo-lowered/stdlib-000.c', '-o', '/working/tinygo-lowered/stdlib-000.o'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-lowered/program-000.o', '/working/tinygo-lowered/stdlib-000.o', '-o', '/working/tinygo-lowered-out.wasm'],
      cwd: '/working',
    },
  }, {
    artifactOutputPath: '/working/tinygo-lowered-out.wasm',
    objectFiles: ['/working/tinygo-lowered/program-000.o', '/working/tinygo-lowered/stdlib-000.o'],
  })

  assert.equal(verification.artifactOutputPath, '/working/tinygo-lowered-out.wasm')
  assert.equal(verification.objectFiles.length, 2)
})

test('verifyLoweredArtifactManifestAgainstLoweredCommandBatchManifest rejects mismatched lowered artifact metadata', () => {
  assert.throws(() => verifyLoweredArtifactManifestAgainstLoweredCommandBatchManifest({
    compileCommands: [
      {
        argv: ['/usr/bin/clang', '--target=wasm32-unknown-wasi', '-Oz', '-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext', '-c', '/working/tinygo-lowered/program-000.c', '-o', '/working/tinygo-lowered/program-000.o'],
        cwd: '/working',
      },
    ],
    linkCommand: {
      argv: ['/usr/bin/wasm-ld', '--stack-first', '--no-demangle', '--no-entry', '--export-all', '/working/tinygo-lowered/program-000.o', '-o', '/working/tinygo-lowered-out.wasm'],
      cwd: '/working',
    },
  }, {
    artifactOutputPath: '/working/out.wasm',
    objectFiles: ['/working/tinygo-lowered/program-000.o'],
  }), /frontend lowered artifact manifest did not match lowered command batch manifest/)
})
