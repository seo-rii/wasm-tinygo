export type CompileUnitToolInvocation = {
  argv: string[]
  cwd: string
}

export type TinyGoCompileUnitManifest = {
  entryFile?: string
  optimizeFlag?: string
  materializedFiles?: string[]
  toolchain?: {
    target?: string
    llvmTarget?: string
    linker?: string
    cflags?: string[]
    ldflags?: string[]
    translationUnitPath?: string
    objectOutputPath?: string
    artifactOutputPath?: string
  }
  sourceSelection?: {
    targetAssets?: string[]
    runtimeSupport?: string[]
    program?: string[]
    imported?: string[]
    stdlib?: string[]
    allCompile?: string[]
  }
}

export type TinyGoCompileRequestContract = {
  entryFile?: string
  compileUnitManifestPath?: string
  target?: string
  llvmTarget?: string
  linker?: string
  cflags?: string[]
  ldflags?: string[]
  translationUnitPath?: string
  objectOutputPath?: string
  artifactOutputPath?: string
  targetAssetFiles?: string[]
  runtimeSupportFiles?: string[]
  programFiles?: string[]
  importedPackageFiles?: string[]
  stdlibPackageFiles?: string[]
  allCompileFiles?: string[]
  toolPlan?: CompileUnitToolInvocation[]
}

export type TinyGoIntermediateManifest = {
  entryFile?: string
  optimizeFlag?: string
  toolchain?: {
    target?: string
    llvmTarget?: string
    linker?: string
    cflags?: string[]
    ldflags?: string[]
    translationUnitPath?: string
    objectOutputPath?: string
    artifactOutputPath?: string
  }
  sourceSelection?: {
    targetAssets?: string[]
    runtimeSupport?: string[]
    program?: string[]
    imported?: string[]
    stdlib?: string[]
    allCompile?: string[]
  }
  compileUnits?: Array<{
    kind?: string
    packageDir?: string
    files?: string[]
  }>
}

export type TinyGoLoweringManifest = {
  entryFile?: string
  optimizeFlag?: string
  toolchain?: {
    target?: string
    llvmTarget?: string
    linker?: string
    cflags?: string[]
    ldflags?: string[]
    translationUnitPath?: string
    objectOutputPath?: string
    artifactOutputPath?: string
  }
  support?: {
    targetAssets?: string[]
    runtimeSupport?: string[]
  }
  compileUnits?: Array<{
    kind?: string
    packageDir?: string
    files?: string[]
  }>
}

export type TinyGoWorkItemsManifest = {
  entryFile?: string
  optimizeFlag?: string
  workItems?: Array<{
    id?: string
    kind?: string
    packageDir?: string
    files?: string[]
    bitcodeOutputPath?: string
  }>
}

export type TinyGoLoweredSourcesManifest = {
  entryFile?: string
  optimizeFlag?: string
  units?: Array<{
    id?: string
    kind?: string
    packageDir?: string
    sourceFiles?: string[]
    loweredSourcePath?: string
  }>
}

export type TinyGoLoweredIRManifest = {
  entryFile?: string
  optimizeFlag?: string
  units?: Array<{
    id?: string
    kind?: string
    packageDir?: string
    sourceFiles?: string[]
    loweredSourcePath?: string
    packageName?: string
    imports?: Array<{
      path?: string
      alias?: string
    }>
    functions?: Array<{
      name?: string
      exported?: boolean
      method?: boolean
      main?: boolean
      init?: boolean
      parameters?: number
      results?: number
    }>
    types?: Array<{
      name?: string
      exported?: boolean
      kind?: string
    }>
    constants?: Array<{
      name?: string
      exported?: boolean
    }>
    variables?: Array<{
      name?: string
      exported?: boolean
    }>
    declarations?: Array<{
      kind?: string
      name?: string
      exported?: boolean
      method?: boolean
    }>
    placeholderBlocks?: Array<{
      stage?: string
      index?: number
      value?: string
      signature?: string
    }>
    loweringBlocks?: Array<{
      stage?: string
      index?: number
      value?: string
    }>
  }>
}

export type TinyGoLoweredBitcodeManifest = {
  bitcodeFiles?: string[]
}

export type TinyGoLoweredArtifactManifest = {
  artifactOutputPath?: string
  objectFiles?: string[]
}

export type TinyGoCommandArtifactManifest = {
  artifactOutputPath?: string
  bitcodeFiles?: string[]
}

export type TinyGoLoweringPlanManifest = {
  entryFile?: string
  optimizeFlag?: string
  compileJobs?: Array<{
    id?: string
    kind?: string
    packageDir?: string
    files?: string[]
    bitcodeOutputPath?: string
    llvmTarget?: string
    cflags?: string[]
    optimizeFlag?: string
  }>
  linkJob?: {
    linker?: string
    ldflags?: string[]
    artifactOutputPath?: string
    bitcodeInputs?: string[]
  }
}

export type TinyGoBackendInputManifest = {
  entryFile?: string
  optimizeFlag?: string
  compileJobs?: Array<{
    id?: string
    kind?: string
    packageDir?: string
    files?: string[]
    bitcodeOutputPath?: string
    llvmTarget?: string
    cflags?: string[]
    optimizeFlag?: string
  }>
  linkJob?: {
    linker?: string
    ldflags?: string[]
    artifactOutputPath?: string
    bitcodeInputs?: string[]
  }
  loweredUnits?: Array<{
    id?: string
    kind?: string
    packageDir?: string
    sourceFiles?: string[]
    loweredSourcePath?: string
  }>
}

export type TinyGoBackendResultManifest = {
  ok?: boolean
  generatedFiles?: Array<{
    path: string
    contents: string
  }>
  diagnostics?: string[]
}

export type TinyGoCommandBatchManifest = {
  compileCommands?: Array<{
    argv?: string[]
    cwd?: string
  }>
  linkCommand?: {
    argv?: string[]
    cwd?: string
  }
}

const defaultTargetProfiles: Record<string, { llvmTarget: string; linker: string; cflags: string[]; ldflags: string[] }> = {
  wasm: {
    llvmTarget: 'wasm32-unknown-wasi',
    linker: 'wasm-ld',
    cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
    ldflags: ['--stack-first', '--no-demangle'],
  },
  wasip1: {
    llvmTarget: 'wasm32-unknown-wasi',
    linker: 'wasm-ld',
    cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
    ldflags: ['--stack-first', '--no-demangle'],
  },
}

const normalizeCompileUnitToolchain = (manifest: TinyGoCompileUnitManifest) => {
  const target = manifest.toolchain?.target ?? ''
  const profile = target === '' ? undefined : defaultTargetProfiles[target]
  const llvmTarget = manifest.toolchain?.llvmTarget ?? profile?.llvmTarget ?? ''
  const linker = manifest.toolchain?.linker ?? profile?.linker ?? ''
  const cflags = manifest.toolchain?.cflags ?? profile?.cflags ?? []
  const ldflags = manifest.toolchain?.ldflags ?? profile?.ldflags ?? []
  const translationUnitPath = manifest.toolchain?.translationUnitPath ?? '/working/tinygo-bootstrap.c'
  const objectOutputPath = manifest.toolchain?.objectOutputPath ?? '/working/tinygo-bootstrap.o'
  const artifactOutputPath = manifest.toolchain?.artifactOutputPath ?? ''

  if (target === '' || llvmTarget === '' || linker === '' || artifactOutputPath === '') {
    throw new Error('frontend compile unit toolchain was incomplete')
  }

  return {
    target,
    llvmTarget,
    linker,
    cflags,
    ldflags,
    translationUnitPath,
    objectOutputPath,
    artifactOutputPath,
  }
}

const normalizeExecutionLdflags = (ldflags: string[]) => {
  const executionLdflags = [...ldflags]
  for (const flag of ['--no-entry', '--export-all']) {
    if (!executionLdflags.includes(flag)) {
      executionLdflags.push(flag)
    }
  }
  return executionLdflags
}

export const buildToolPlanFromCompileUnitManifest = (
  manifest: TinyGoCompileUnitManifest,
): CompileUnitToolInvocation[] => {
  const normalizedToolchain = normalizeCompileUnitToolchain(manifest)
  const translationUnitPath = normalizedToolchain.translationUnitPath
  const objectOutputPath = normalizedToolchain.objectOutputPath
  const artifactOutputPath = normalizedToolchain.artifactOutputPath
  const translationUnitPathIndex = translationUnitPath.lastIndexOf('/')
  const objectOutputPathIndex = objectOutputPath.lastIndexOf('/')
  const compileCwd = translationUnitPathIndex > 0 ? translationUnitPath.slice(0, translationUnitPathIndex) : '/working'
  const linkCwd = objectOutputPathIndex > 0 ? objectOutputPath.slice(0, objectOutputPathIndex) : compileCwd
  const translationUnitName = translationUnitPathIndex >= 0 ? translationUnitPath.slice(translationUnitPathIndex + 1) : translationUnitPath
  const objectOutputName = objectOutputPathIndex >= 0 ? objectOutputPath.slice(objectOutputPathIndex + 1) : objectOutputPath

  return [
    {
      argv: [
        '/usr/bin/clang',
        `--target=${normalizedToolchain.llvmTarget}`,
        ...(manifest.optimizeFlag ? [manifest.optimizeFlag] : []),
        ...normalizedToolchain.cflags,
        '-c',
        translationUnitName,
        '-o',
        objectOutputName,
      ],
      cwd: compileCwd,
    },
    {
      argv: [
        `/usr/bin/${normalizedToolchain.linker}`,
        ...normalizedToolchain.ldflags,
        '--no-entry',
        '--export-all',
        objectOutputName,
        '-o',
        artifactOutputPath,
      ],
      cwd: linkCwd,
    },
  ]
}

export const verifyCompileUnitManifestAgainstCompileRequest = (
  manifest: TinyGoCompileUnitManifest,
  compileRequest: TinyGoCompileRequestContract,
) => {
  const rawManifest = manifest as Record<string, unknown>
  for (const field of [
    'target',
    'llvmTarget',
    'linker',
    'cflags',
    'ldflags',
    'translationUnitPath',
    'objectOutputPath',
    'artifactOutputPath',
  ]) {
    if (field in rawManifest) {
      throw new Error('frontend compile unit legacy top-level toolchain fields are not supported')
    }
  }
  for (const field of [
    'programFiles',
    'importedPackageFiles',
    'stdlibPackageFiles',
    'allCompileFiles',
    'targetAssetFiles',
    'runtimeSupportFiles',
  ]) {
    if (field in rawManifest) {
      throw new Error('frontend compile unit legacy top-level source-file groups are not supported')
    }
  }
  const normalizedToolchain = normalizeCompileUnitToolchain(manifest)
  if (compileRequest.entryFile !== undefined && manifest.entryFile !== compileRequest.entryFile) {
    throw new Error('frontend compile unit entry file did not match compile request')
  }

  if (
    (compileRequest.cflags !== undefined && JSON.stringify(normalizedToolchain.cflags) !== JSON.stringify(compileRequest.cflags)) ||
    (compileRequest.ldflags !== undefined && JSON.stringify(normalizedToolchain.ldflags) !== JSON.stringify(compileRequest.ldflags)) ||
    (compileRequest.target !== undefined && normalizedToolchain.target !== compileRequest.target) ||
    (compileRequest.llvmTarget !== undefined && normalizedToolchain.llvmTarget !== compileRequest.llvmTarget) ||
    (compileRequest.linker !== undefined && normalizedToolchain.linker !== compileRequest.linker) ||
    (compileRequest.translationUnitPath !== undefined &&
      normalizedToolchain.translationUnitPath !== compileRequest.translationUnitPath) ||
    (compileRequest.objectOutputPath !== undefined &&
      normalizedToolchain.objectOutputPath !== compileRequest.objectOutputPath) ||
    (compileRequest.artifactOutputPath !== undefined &&
      normalizedToolchain.artifactOutputPath !== compileRequest.artifactOutputPath)
  ) {
    throw new Error('frontend compile unit toolchain did not match compile request')
  }

  if (
    typeof manifest.entryFile !== 'string' ||
    manifest.entryFile === '' ||
    !Array.isArray(manifest.sourceSelection?.allCompile) ||
    !Array.isArray(manifest.materializedFiles)
  ) {
    throw new Error('frontend compile unit source selection was missing normalized compile inputs')
  }

  const materializedFiles = manifest.materializedFiles
  const allCompileFiles = manifest.sourceSelection.allCompile
  const entryPackageDir = manifest.entryFile.slice(0, manifest.entryFile.lastIndexOf('/')) || '.'
  const stdlibPackageFiles = Array.isArray(manifest.sourceSelection?.stdlib)
    ? manifest.sourceSelection.stdlib
    : allCompileFiles.filter((filePath) => {
        return filePath.startsWith('/working/.tinygo-root/src/')
      })
  const importedPackageFiles = Array.isArray(manifest.sourceSelection?.imported)
    ? manifest.sourceSelection.imported
    : allCompileFiles.filter((filePath) => {
        if (stdlibPackageFiles.includes(filePath)) {
          return false
        }
        const slashIndex = filePath.lastIndexOf('/')
        const fileDir = slashIndex > 0 ? filePath.slice(0, slashIndex) : ''
        return fileDir !== entryPackageDir
      })
  const programFiles = Array.isArray(manifest.sourceSelection?.program)
    ? manifest.sourceSelection.program
    : allCompileFiles.filter((filePath) => {
        if (importedPackageFiles.includes(filePath) || stdlibPackageFiles.includes(filePath)) {
          return false
        }
        const slashIndex = filePath.lastIndexOf('/')
        const fileDir = slashIndex > 0 ? filePath.slice(0, slashIndex) : ''
        return fileDir === entryPackageDir
      })
  const targetAssetFiles = Array.isArray(manifest.sourceSelection?.targetAssets)
    ? manifest.sourceSelection.targetAssets
    : materializedFiles.filter((filePath) => filePath.startsWith('/working/.tinygo-root/targets/'))
  const generatedFileSet = new Set<string>([
    normalizedToolchain.translationUnitPath,
    '/working/tinygo-compile-unit.json',
  ])
  const stdlibFileSet = new Set<string>(stdlibPackageFiles)
  const targetAssetSet = new Set<string>(targetAssetFiles)
  const runtimeSupportFiles = Array.isArray(manifest.sourceSelection?.runtimeSupport)
    ? manifest.sourceSelection.runtimeSupport
    : materializedFiles.filter((filePath) => {
        if (generatedFileSet.has(filePath) || stdlibFileSet.has(filePath) || targetAssetSet.has(filePath)) {
          return false
        }
        return true
      })

  if (
    (compileRequest.targetAssetFiles !== undefined &&
      JSON.stringify(targetAssetFiles) !== JSON.stringify(compileRequest.targetAssetFiles)) ||
    (compileRequest.runtimeSupportFiles !== undefined &&
      JSON.stringify(runtimeSupportFiles) !== JSON.stringify(compileRequest.runtimeSupportFiles)) ||
    (compileRequest.programFiles !== undefined && JSON.stringify(programFiles) !== JSON.stringify(compileRequest.programFiles)) ||
    (compileRequest.importedPackageFiles !== undefined &&
      JSON.stringify(importedPackageFiles) !== JSON.stringify(compileRequest.importedPackageFiles)) ||
    (compileRequest.stdlibPackageFiles !== undefined &&
      JSON.stringify(stdlibPackageFiles) !== JSON.stringify(compileRequest.stdlibPackageFiles)) ||
    (compileRequest.allCompileFiles !== undefined &&
      JSON.stringify(allCompileFiles) !== JSON.stringify(compileRequest.allCompileFiles))
  ) {
    throw new Error('frontend compile unit source selection did not match compile request')
  }

  const toolPlan = buildToolPlanFromCompileUnitManifest(manifest)
  if (compileRequest.toolPlan?.length && JSON.stringify(toolPlan) !== JSON.stringify(compileRequest.toolPlan)) {
    throw new Error('frontend compile unit tool plan did not match compile request')
  }

  const compileUnits: Array<{ kind: string; packageDir: string; files: string[] }> = []
  if (programFiles.length !== 0) {
    compileUnits.push({
      kind: 'program',
      packageDir: entryPackageDir,
      files: [...programFiles],
    })
  }
  for (const [kind, files] of [
    ['imported', importedPackageFiles],
    ['stdlib', stdlibPackageFiles],
  ] as const) {
    const groupedFiles = new Map<string, string[]>()
    for (const filePath of files) {
      const slashIndex = filePath.lastIndexOf('/')
      const packageDir = slashIndex > 0 ? filePath.slice(0, slashIndex) : ''
      const packageFiles = groupedFiles.get(packageDir)
      if (packageFiles) {
        packageFiles.push(filePath)
        continue
      }
      groupedFiles.set(packageDir, [filePath])
    }
    const packageDirs = [...groupedFiles.keys()].sort()
    for (const packageDir of packageDirs) {
      compileUnits.push({
        kind,
        packageDir,
        files: groupedFiles.get(packageDir) ?? [],
      })
    }
  }

  return {
    toolPlan,
    toolchain: {
      ...normalizedToolchain,
      ldflags: normalizeExecutionLdflags(normalizedToolchain.ldflags),
    },
    sourceSelection: {
      targetAssets: targetAssetFiles,
      runtimeSupport: runtimeSupportFiles,
      program: programFiles,
      imported: importedPackageFiles,
      stdlib: stdlibPackageFiles,
      allCompile: allCompileFiles,
    },
    compileUnits,
    summary: {
      programCount: programFiles.length,
      importedCount: importedPackageFiles.length,
      stdlibCount: stdlibPackageFiles.length,
      allCompileCount: allCompileFiles.length,
    },
  }
}

export const verifyIntermediateManifestAgainstCompileUnitManifest = (
  compileUnitManifest: TinyGoCompileUnitManifest,
  intermediateManifest: TinyGoIntermediateManifest,
) => {
  const compileUnitVerification = verifyCompileUnitManifestAgainstCompileRequest(compileUnitManifest, {})

  if (compileUnitManifest.entryFile !== intermediateManifest.entryFile) {
    throw new Error('frontend intermediate entry file did not match compile unit manifest')
  }
  if ((compileUnitManifest.optimizeFlag ?? '') !== (intermediateManifest.optimizeFlag ?? '')) {
    throw new Error('frontend intermediate optimize flag did not match compile unit manifest')
  }
  if (JSON.stringify(compileUnitVerification.toolchain) !== JSON.stringify(intermediateManifest.toolchain ?? {})) {
    throw new Error('frontend intermediate toolchain did not match compile unit manifest')
  }
  if (JSON.stringify(compileUnitVerification.sourceSelection) !== JSON.stringify(intermediateManifest.sourceSelection ?? {})) {
    throw new Error('frontend intermediate source selection did not match compile unit manifest')
  }
  if (JSON.stringify(compileUnitVerification.compileUnits) !== JSON.stringify(intermediateManifest.compileUnits ?? [])) {
    throw new Error('frontend intermediate compile units did not match compile unit manifest')
  }

  return compileUnitVerification
}

export const verifyLoweringManifestAgainstIntermediateManifest = (
  intermediateManifest: TinyGoIntermediateManifest,
  loweringManifest: TinyGoLoweringManifest,
) => {
  if ((intermediateManifest.entryFile ?? '') !== (loweringManifest.entryFile ?? '')) {
    throw new Error('frontend lowering entry file did not match intermediate manifest')
  }
  if ((intermediateManifest.optimizeFlag ?? '') !== (loweringManifest.optimizeFlag ?? '')) {
    throw new Error('frontend lowering optimize flag did not match intermediate manifest')
  }
  if (JSON.stringify(intermediateManifest.toolchain ?? {}) !== JSON.stringify(loweringManifest.toolchain ?? {})) {
    throw new Error('frontend lowering toolchain did not match intermediate manifest')
  }

  const support = {
    targetAssets: intermediateManifest.sourceSelection?.targetAssets ?? [],
    runtimeSupport: intermediateManifest.sourceSelection?.runtimeSupport ?? [],
  }
  if (JSON.stringify(support) !== JSON.stringify(loweringManifest.support ?? {})) {
    throw new Error('frontend lowering support files did not match intermediate manifest')
  }
  if (JSON.stringify(intermediateManifest.compileUnits ?? []) !== JSON.stringify(loweringManifest.compileUnits ?? [])) {
    throw new Error('frontend lowering compile units did not match intermediate manifest')
  }

  return {
    toolchain: intermediateManifest.toolchain ?? {},
    support,
    compileUnits: intermediateManifest.compileUnits ?? [],
  }
}

export const verifyWorkItemsManifestAgainstLoweringManifest = (
  loweringManifest: TinyGoLoweringManifest,
  workItemsManifest: TinyGoWorkItemsManifest,
) => {
  if ((loweringManifest.entryFile ?? '') !== (workItemsManifest.entryFile ?? '')) {
    throw new Error('frontend work items entry file did not match lowering manifest')
  }
  if ((loweringManifest.optimizeFlag ?? '') !== (workItemsManifest.optimizeFlag ?? '')) {
    throw new Error('frontend work items optimize flag did not match lowering manifest')
  }

  const kindIndexes = new Map<string, number>()
  const workItems = (loweringManifest.compileUnits ?? []).map((compileUnit) => {
    const kind = compileUnit.kind ?? ''
    const kindIndex = kindIndexes.get(kind) ?? 0
    kindIndexes.set(kind, kindIndex + 1)
    const id = `${kind}-${String(kindIndex).padStart(3, '0')}`
    return {
      id,
      kind,
      packageDir: compileUnit.packageDir ?? '',
      files: compileUnit.files ?? [],
      bitcodeOutputPath: `/working/tinygo-work/${id}.bc`,
    }
  })

  if (JSON.stringify(workItems) !== JSON.stringify(workItemsManifest.workItems ?? [])) {
    throw new Error('frontend work items did not match lowering manifest')
  }

  return {
    workItems,
  }
}

export const verifyLoweredSourcesManifestAgainstWorkItemsManifest = (
  workItemsManifest: TinyGoWorkItemsManifest,
  loweredSourcesManifest: TinyGoLoweredSourcesManifest,
) => {
  if ((workItemsManifest.entryFile ?? '') !== (loweredSourcesManifest.entryFile ?? '')) {
    throw new Error('frontend lowered sources entry file did not match work items manifest')
  }
  if ((workItemsManifest.optimizeFlag ?? '') !== (loweredSourcesManifest.optimizeFlag ?? '')) {
    throw new Error('frontend lowered sources optimize flag did not match work items manifest')
  }

  const units = (workItemsManifest.workItems ?? []).map((workItem) => ({
    id: workItem.id ?? '',
    kind: workItem.kind ?? '',
    packageDir: workItem.packageDir ?? '',
    sourceFiles: workItem.files ?? [],
    loweredSourcePath: `/working/tinygo-lowered/${workItem.id ?? ''}.c`,
  }))
  if (JSON.stringify(units) !== JSON.stringify(loweredSourcesManifest.units ?? [])) {
    throw new Error('frontend lowered sources did not match work items manifest')
  }

  return {
    units,
  }
}

export const verifyLoweredCommandBatchAgainstCompileUnitAndLoweredSourcesManifest = (
  compileUnitManifest: TinyGoCompileUnitManifest,
  loweredSourcesManifest: TinyGoLoweredSourcesManifest,
  commandBatchManifest: TinyGoCommandBatchManifest,
) => {
  if ((compileUnitManifest.entryFile ?? '') !== (loweredSourcesManifest.entryFile ?? '')) {
    throw new Error('frontend lowered command batch entry file did not match compile-unit and lowered sources manifests')
  }
  if ((compileUnitManifest.optimizeFlag ?? '') !== (loweredSourcesManifest.optimizeFlag ?? '')) {
    throw new Error('frontend lowered command batch optimize flag did not match compile-unit and lowered sources manifests')
  }

  const normalizedToolchain = normalizeCompileUnitToolchain(compileUnitManifest)
  const compileCommands = (loweredSourcesManifest.units ?? []).map((unit) => {
    const loweredSourcePath = unit.loweredSourcePath ?? ''
    const objectOutputPath = loweredSourcePath.endsWith('.c') ? `${loweredSourcePath.slice(0, -2)}.o` : `${loweredSourcePath}.o`
    return {
      argv: [
        '/usr/bin/clang',
        `--target=${normalizedToolchain.llvmTarget}`,
        ...(compileUnitManifest.optimizeFlag ? [compileUnitManifest.optimizeFlag] : []),
        ...normalizedToolchain.cflags,
        '-c',
        loweredSourcePath,
        '-o',
        objectOutputPath,
      ],
      cwd: '/working',
    }
  })
  if (JSON.stringify(compileCommands) !== JSON.stringify(commandBatchManifest.compileCommands ?? [])) {
    throw new Error('frontend lowered command batch compile commands did not match compile-unit and lowered sources manifests')
  }

  const linkCommand = {
    argv: [
      `/usr/bin/${normalizedToolchain.linker}`,
      ...normalizeExecutionLdflags(normalizedToolchain.ldflags),
      ...(loweredSourcesManifest.units ?? []).map((unit) => {
        const loweredSourcePath = unit.loweredSourcePath ?? ''
        return loweredSourcePath.endsWith('.c') ? `${loweredSourcePath.slice(0, -2)}.o` : `${loweredSourcePath}.o`
      }),
      '-o',
      '/working/tinygo-lowered-out.wasm',
    ],
    cwd: '/working',
  }
  if (JSON.stringify(linkCommand) !== JSON.stringify(commandBatchManifest.linkCommand ?? {})) {
    throw new Error('frontend lowered command batch link command did not match compile-unit and lowered sources manifests')
  }

  return {
    compileCommands,
    linkCommand,
  }
}

export const verifyLoweredArtifactManifestAgainstLoweredCommandBatchManifest = (
  commandBatchManifest: TinyGoCommandBatchManifest,
  loweredArtifactManifest: TinyGoLoweredArtifactManifest,
) => {
  const linkArgv = commandBatchManifest.linkCommand?.argv ?? []
  const artifactOutputPath = linkArgv.length >= 2 ? linkArgv[linkArgv.length - 1] ?? '' : ''
  const objectFiles = (commandBatchManifest.compileCommands ?? []).map((command) => {
    const argv = command.argv ?? []
    return argv.length >= 2 ? argv[argv.length - 1] ?? '' : ''
  })

  if (artifactOutputPath !== (loweredArtifactManifest.artifactOutputPath ?? '')) {
    throw new Error('frontend lowered artifact manifest did not match lowered command batch manifest')
  }
  if (JSON.stringify(objectFiles) !== JSON.stringify(loweredArtifactManifest.objectFiles ?? [])) {
    throw new Error('frontend lowered artifact manifest did not match lowered command batch manifest')
  }

  return {
    artifactOutputPath,
    objectFiles,
  }
}

export const verifyLoweringPlanAgainstWorkItemsManifest = (
  workItemsManifest: TinyGoWorkItemsManifest,
  loweringPlanManifest: TinyGoLoweringPlanManifest,
) => {
  if ((workItemsManifest.entryFile ?? '') !== (loweringPlanManifest.entryFile ?? '')) {
    throw new Error('frontend lowering plan entry file did not match work items manifest')
  }
  if ((workItemsManifest.optimizeFlag ?? '') !== (loweringPlanManifest.optimizeFlag ?? '')) {
    throw new Error('frontend lowering plan optimize flag did not match work items manifest')
  }

  const compileJobs = (workItemsManifest.workItems ?? []).map((workItem) => ({
    id: workItem.id ?? '',
    kind: workItem.kind ?? '',
    packageDir: workItem.packageDir ?? '',
    files: workItem.files ?? [],
    bitcodeOutputPath: workItem.bitcodeOutputPath ?? '',
    llvmTarget: 'wasm32-unknown-wasi',
    cflags: ['-mbulk-memory', '-mnontrapping-fptoint', '-mno-multivalue', '-mno-reference-types', '-msign-ext'],
    optimizeFlag: workItemsManifest.optimizeFlag ?? '',
  }))
  if (JSON.stringify(compileJobs) !== JSON.stringify(loweringPlanManifest.compileJobs ?? [])) {
    throw new Error('frontend lowering plan compile jobs did not match work items manifest')
  }

  const linkJob = {
    linker: 'wasm-ld',
    ldflags: ['--stack-first', '--no-demangle', '--no-entry', '--export-all'],
    artifactOutputPath: '/working/out.wasm',
    bitcodeInputs: compileJobs.map((job) => job.bitcodeOutputPath),
  }
  if (JSON.stringify(linkJob) !== JSON.stringify(loweringPlanManifest.linkJob ?? {})) {
    throw new Error('frontend lowering plan link job did not match work items manifest')
  }

  return {
    compileJobs,
    linkJob,
  }
}

const deriveLoweredUnitsFromBackendInputManifest = (
  backendInputManifest: TinyGoBackendInputManifest,
  errorMessage: string,
) => {
  const loweredUnits = (backendInputManifest.compileJobs ?? []).map((compileJob) => {
    const id = compileJob.id ?? ''
    const kind = compileJob.kind ?? ''
    const packageDir = compileJob.packageDir ?? ''
    const sourceFiles = compileJob.files ?? []
    if (id === '' || kind === '' || packageDir === '' || sourceFiles.length === 0) {
      throw new Error(errorMessage)
    }
    return {
      id,
      kind,
      packageDir,
      sourceFiles,
      loweredSourcePath: `/working/tinygo-lowered/${id}.c`,
    }
  })
  if (
    backendInputManifest.loweredUnits !== undefined &&
    JSON.stringify(loweredUnits) !== JSON.stringify(backendInputManifest.loweredUnits ?? [])
  ) {
    throw new Error(errorMessage)
  }
  return loweredUnits
}

const deriveLinkBitcodeInputsFromBackendInputManifest = (
  backendInputManifest: TinyGoBackendInputManifest,
  errorMessage: string,
) => {
  const bitcodeInputs = (backendInputManifest.compileJobs ?? []).map((compileJob) => {
    const bitcodeOutputPath = compileJob.bitcodeOutputPath ?? ''
    if (bitcodeOutputPath === '') {
      throw new Error(errorMessage)
    }
    return bitcodeOutputPath
  })
  if (
    backendInputManifest.linkJob?.bitcodeInputs !== undefined &&
    JSON.stringify(bitcodeInputs) !== JSON.stringify(backendInputManifest.linkJob?.bitcodeInputs ?? [])
  ) {
    throw new Error(errorMessage)
  }
  return bitcodeInputs
}

const deriveOptimizeFlagFromBackendInputManifest = (
  backendInputManifest: TinyGoBackendInputManifest,
  errorMessage: string,
) => {
  const optimizeFlag = (backendInputManifest.compileJobs ?? []).reduce<string | null>((derived, compileJob) => {
    const current = compileJob.optimizeFlag ?? ''
    if (derived === null || derived === current) {
      return current
    }
    throw new Error(errorMessage)
  }, null) ?? ''
  if (
    backendInputManifest.optimizeFlag !== undefined &&
    optimizeFlag !== (backendInputManifest.optimizeFlag ?? '')
  ) {
    throw new Error(errorMessage)
  }
  return optimizeFlag
}

export const verifyBackendInputManifestAgainstLoweringPlanAndLoweredSourcesManifest = (
  loweringPlanManifest: TinyGoLoweringPlanManifest,
  loweredSourcesManifest: TinyGoLoweredSourcesManifest,
  backendInputManifest: TinyGoBackendInputManifest,
) => {
  if ((loweringPlanManifest.entryFile ?? '') !== (backendInputManifest.entryFile ?? '')) {
    throw new Error('frontend backend input did not match lowering plan and lowered sources manifests')
  }
  if (
    (loweringPlanManifest.optimizeFlag ?? '') !==
    deriveOptimizeFlagFromBackendInputManifest(
      backendInputManifest,
      'frontend backend input did not match lowering plan and lowered sources manifests',
    )
  ) {
    throw new Error('frontend backend input did not match lowering plan and lowered sources manifests')
  }
  if (JSON.stringify(loweringPlanManifest.compileJobs ?? []) !== JSON.stringify(backendInputManifest.compileJobs ?? [])) {
    throw new Error('frontend backend input did not match lowering plan and lowered sources manifests')
  }
  const linkJob = {
    linker: backendInputManifest.linkJob?.linker ?? '',
    ldflags: backendInputManifest.linkJob?.ldflags ?? [],
    artifactOutputPath: backendInputManifest.linkJob?.artifactOutputPath ?? '',
    bitcodeInputs: deriveLinkBitcodeInputsFromBackendInputManifest(
      backendInputManifest,
      'frontend backend input did not match lowering plan and lowered sources manifests',
    ),
  }
  if (JSON.stringify(loweringPlanManifest.linkJob ?? {}) !== JSON.stringify(linkJob)) {
    throw new Error('frontend backend input did not match lowering plan and lowered sources manifests')
  }
  const loweredUnits = deriveLoweredUnitsFromBackendInputManifest(
    backendInputManifest,
    'frontend backend input did not match lowering plan and lowered sources manifests',
  )
  if (JSON.stringify(loweredSourcesManifest.units ?? []) !== JSON.stringify(loweredUnits)) {
    throw new Error('frontend backend input did not match lowering plan and lowered sources manifests')
  }

  return {
    compileJobs: backendInputManifest.compileJobs ?? [],
    linkJob,
    loweredUnits,
  }
}

export const verifyCommandBatchAgainstLoweringPlanAndLoweredSourcesManifest = (
  loweringPlanManifest: TinyGoLoweringPlanManifest,
  loweredSourcesManifest: TinyGoLoweredSourcesManifest,
  commandBatchManifest: TinyGoCommandBatchManifest,
) => {
  const compileCommands = buildLoweredBitcodeCompileCommandsFromLoweringPlanAndLoweredSourcesManifest(
    loweringPlanManifest,
    loweredSourcesManifest,
  )
  if (JSON.stringify(compileCommands) !== JSON.stringify(commandBatchManifest.compileCommands ?? [])) {
    throw new Error('frontend command batch compile commands did not match lowering plan and lowered sources manifests')
  }

  const linkJob = loweringPlanManifest.linkJob ?? {}
  const linkCommand = {
    argv: [
      `/usr/bin/${linkJob.linker ?? ''}`,
      ...(linkJob.ldflags ?? []),
      ...(linkJob.bitcodeInputs ?? []),
      '-o',
      linkJob.artifactOutputPath ?? '',
    ],
    cwd: '/working',
  }
  if (JSON.stringify(linkCommand) !== JSON.stringify(commandBatchManifest.linkCommand ?? {})) {
    throw new Error('frontend command batch link command did not match lowering plan manifest')
  }

  return {
    compileCommands,
    linkCommand,
  }
}

export const verifyCommandBatchAgainstBackendInputManifest = (
  backendInputManifest: TinyGoBackendInputManifest,
  commandBatchManifest: TinyGoCommandBatchManifest,
) => {
  const loweredUnitsByID = new Map(
    deriveLoweredUnitsFromBackendInputManifest(
      backendInputManifest,
      'frontend command batch did not match backend input manifest',
    ).map((unit) => [unit.id ?? '', unit]),
  )
  const compileCommands = (backendInputManifest.compileJobs ?? []).map((compileJob) => {
    const loweredUnit = loweredUnitsByID.get(compileJob.id ?? '')
    if (
      !loweredUnit ||
      (compileJob.kind ?? '') !== (loweredUnit.kind ?? '') ||
      (compileJob.packageDir ?? '') !== (loweredUnit.packageDir ?? '') ||
      JSON.stringify(compileJob.files ?? []) !== JSON.stringify(loweredUnit.sourceFiles ?? []) ||
      typeof loweredUnit.loweredSourcePath !== 'string' ||
      loweredUnit.loweredSourcePath === '' ||
      typeof compileJob.llvmTarget !== 'string' ||
      compileJob.llvmTarget === '' ||
      typeof compileJob.bitcodeOutputPath !== 'string' ||
      compileJob.bitcodeOutputPath === ''
    ) {
      throw new Error('frontend command batch did not match backend input manifest')
    }
    return {
      argv: [
        '/usr/bin/clang',
        `--target=${compileJob.llvmTarget}`,
        ...((compileJob.optimizeFlag ?? '') === '' ? [] : [compileJob.optimizeFlag ?? '']),
        ...(compileJob.cflags ?? []),
        '-emit-llvm',
        '-c',
        loweredUnit.loweredSourcePath,
        '-o',
        compileJob.bitcodeOutputPath,
      ],
      cwd: '/working',
    }
  })
  if (JSON.stringify(compileCommands) !== JSON.stringify(commandBatchManifest.compileCommands ?? [])) {
    throw new Error('frontend command batch did not match backend input manifest')
  }

  const linkJob = backendInputManifest.linkJob ?? {}
  const linkCommand = {
    argv: [
      `/usr/bin/${linkJob.linker ?? ''}`,
      ...(linkJob.ldflags ?? []),
      ...deriveLinkBitcodeInputsFromBackendInputManifest(
        backendInputManifest,
        'frontend command batch did not match backend input manifest',
      ),
      '-o',
      linkJob.artifactOutputPath ?? '',
    ],
    cwd: '/working',
  }
  if (JSON.stringify(linkCommand) !== JSON.stringify(commandBatchManifest.linkCommand ?? {})) {
    throw new Error('frontend command batch did not match backend input manifest')
  }

  return {
    compileCommands,
    linkCommand,
  }
}

export const verifyBackendResultManifestAgainstBackendInputAndLoweredBitcodeManifest = (
  backendInputManifest: TinyGoBackendInputManifest,
  loweredBitcodeManifest: TinyGoLoweredBitcodeManifest,
  backendResultManifest: TinyGoBackendResultManifest,
) => {
  if (backendResultManifest.ok !== true) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  const loweredUnits = deriveLoweredUnitsFromBackendInputManifest(
    backendInputManifest,
    'frontend backend result did not match backend input manifest',
  )
  const expectedGeneratedFilePaths = [
    '/working/tinygo-lowered-sources.json',
    '/working/tinygo-lowered-bitcode.json',
    ...loweredUnits.map((loweredUnit) => loweredUnit.loweredSourcePath),
    '/working/tinygo-lowered-ir.json',
    '/working/tinygo-lowered-command-batch.json',
    '/working/tinygo-lowered-artifact.json',
    '/working/tinygo-command-artifact.json',
    '/working/tinygo-command-batch.json',
  ]
  if (
    JSON.stringify((backendResultManifest.generatedFiles ?? []).map((file) => file.path ?? '')) !==
    JSON.stringify(expectedGeneratedFilePaths)
  ) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  if ((backendResultManifest.generatedFiles ?? []).length < 2) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  let loweredSourcesManifest: TinyGoLoweredSourcesManifest
  let loweredBitcodeManifestFromResult: TinyGoLoweredBitcodeManifest
  let loweredIRManifest: TinyGoLoweredIRManifest
  let loweredCommandBatchManifest: TinyGoCommandBatchManifest
  let loweredArtifactManifest: TinyGoLoweredArtifactManifest
  let commandArtifactManifest: TinyGoCommandArtifactManifest
  let commandBatchManifest: TinyGoCommandBatchManifest
  try {
    loweredSourcesManifest = JSON.parse(
      backendResultManifest.generatedFiles?.[0]?.contents ?? '{}',
    ) as TinyGoLoweredSourcesManifest
    loweredBitcodeManifestFromResult = JSON.parse(
      backendResultManifest.generatedFiles?.[1]?.contents ?? '{}',
    ) as TinyGoLoweredBitcodeManifest
    loweredIRManifest = JSON.parse(
      backendResultManifest.generatedFiles?.[(backendResultManifest.generatedFiles?.length ?? 0) - 5]?.contents ?? '{}',
    ) as TinyGoLoweredIRManifest
    loweredCommandBatchManifest = JSON.parse(
      backendResultManifest.generatedFiles?.[(backendResultManifest.generatedFiles?.length ?? 0) - 4]?.contents ?? '{}',
    ) as TinyGoCommandBatchManifest
    loweredArtifactManifest = JSON.parse(
      backendResultManifest.generatedFiles?.[(backendResultManifest.generatedFiles?.length ?? 0) - 3]?.contents ?? '{}',
    ) as TinyGoLoweredArtifactManifest
    commandArtifactManifest = JSON.parse(
      backendResultManifest.generatedFiles?.[(backendResultManifest.generatedFiles?.length ?? 0) - 2]?.contents ?? '{}',
    ) as TinyGoCommandArtifactManifest
    commandBatchManifest = JSON.parse(
      backendResultManifest.generatedFiles?.[(backendResultManifest.generatedFiles?.length ?? 0) - 1]?.contents ?? '{}',
    ) as TinyGoCommandBatchManifest
  } catch {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  if ((backendInputManifest.entryFile ?? '') !== (loweredSourcesManifest.entryFile ?? '')) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  if (
    deriveOptimizeFlagFromBackendInputManifest(
      backendInputManifest,
      'frontend backend result did not match backend input manifest',
    ) !== (loweredSourcesManifest.optimizeFlag ?? '')
  ) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  if (JSON.stringify(loweredUnits) !== JSON.stringify(loweredSourcesManifest.units ?? [])) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  if ((backendInputManifest.entryFile ?? '') !== (loweredIRManifest.entryFile ?? '')) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  if (
    deriveOptimizeFlagFromBackendInputManifest(
      backendInputManifest,
      'frontend backend result did not match backend input manifest',
    ) !== (loweredIRManifest.optimizeFlag ?? '')
  ) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  if (
    JSON.stringify((loweredIRManifest.units ?? []).map((unit) => ({
      id: unit.id ?? '',
      kind: unit.kind ?? '',
      packageDir: unit.packageDir ?? '',
      sourceFiles: unit.sourceFiles ?? [],
      loweredSourcePath: unit.loweredSourcePath ?? '',
    }))) !== JSON.stringify(loweredUnits)
  ) {
    throw new Error('frontend backend result did not match backend input manifest')
  }
  for (const unit of loweredIRManifest.units ?? []) {
    if (
      typeof unit.packageName !== 'string' ||
      !Array.isArray(unit.imports) ||
      !Array.isArray(unit.functions) ||
      !Array.isArray(unit.types) ||
      !Array.isArray(unit.constants) ||
      !Array.isArray(unit.variables) ||
      !Array.isArray(unit.declarations) ||
      !Array.isArray(unit.placeholderBlocks) ||
      !Array.isArray(unit.loweringBlocks)
    ) {
      throw new Error('frontend backend result did not match backend input manifest')
    }
    const functionDeclarations = (unit.declarations ?? [])
      .filter((declaration) => (declaration?.kind ?? '') === 'function')
      .map((declaration) => ({
        kind: declaration.kind ?? '',
        name: declaration.name ?? '',
        exported: declaration.exported ?? false,
        method: declaration.method ?? false,
      }))
    if (
      JSON.stringify(functionDeclarations) !==
      JSON.stringify((unit.functions ?? []).map((fn) => ({
        kind: 'function',
        name: fn.name ?? '',
        exported: fn.exported ?? false,
        method: fn.method ?? false,
      })))
    ) {
      throw new Error('frontend backend result did not match backend input manifest')
    }
    const typeDeclarations = (unit.declarations ?? [])
      .filter((declaration) => (declaration?.kind ?? '') === 'type')
      .map((declaration) => ({
        kind: declaration.kind ?? '',
        name: declaration.name ?? '',
        exported: declaration.exported ?? false,
        method: declaration.method ?? false,
      }))
    if (
      JSON.stringify(typeDeclarations) !==
      JSON.stringify((unit.types ?? []).map((typed) => ({
        kind: 'type',
        name: typed.name ?? '',
        exported: typed.exported ?? false,
        method: false,
      })))
    ) {
      throw new Error('frontend backend result did not match backend input manifest')
    }
    const constantDeclarations = (unit.declarations ?? [])
      .filter((declaration) => (declaration?.kind ?? '') === 'const')
      .map((declaration) => ({
        kind: declaration.kind ?? '',
        name: declaration.name ?? '',
        exported: declaration.exported ?? false,
        method: declaration.method ?? false,
      }))
    if (
      JSON.stringify(constantDeclarations) !==
      JSON.stringify((unit.constants ?? []).map((constant) => ({
        kind: 'const',
        name: constant.name ?? '',
        exported: constant.exported ?? false,
        method: false,
      })))
    ) {
      throw new Error('frontend backend result did not match backend input manifest')
    }
    const variableDeclarations = (unit.declarations ?? [])
      .filter((declaration) => (declaration?.kind ?? '') === 'var')
      .map((declaration) => ({
        kind: declaration.kind ?? '',
        name: declaration.name ?? '',
        exported: declaration.exported ?? false,
        method: declaration.method ?? false,
      }))
    if (
      JSON.stringify(variableDeclarations) !==
      JSON.stringify((unit.variables ?? []).map((variable) => ({
        kind: 'var',
        name: variable.name ?? '',
        exported: variable.exported ?? false,
        method: false,
      })))
    ) {
      throw new Error('frontend backend result did not match backend input manifest')
    }
    if (
      (unit.declarations ?? []).length !==
      (unit.functions ?? []).length + (unit.types ?? []).length + (unit.constants ?? []).length + (unit.variables ?? []).length
    ) {
      throw new Error('frontend backend result did not match backend input manifest')
    }
    const expectedPlaceholderBlocks: Array<{
      stage: string
      index: number
      value: string
      signature: string
    }> = []
    for (const [importIndex, loweredImport] of (unit.imports ?? []).entries()) {
      const importAlias = loweredImport.alias ?? ''
      const importPath = loweredImport.path ?? ''
      expectedPlaceholderBlocks.push({
        stage: 'import',
        index: importIndex,
        value: importAlias !== '' ? `import:${importAlias}=${importPath}` : `import:${importPath}`,
        signature: importAlias !== '' ? `${importAlias}=${importPath}` : importPath,
      })
    }
    for (const [functionIndex, loweredFunction] of (unit.functions ?? []).entries()) {
      expectedPlaceholderBlocks.push({
        stage: 'function',
        index: functionIndex,
        value: [
          'function',
          loweredFunction.name ?? '',
          (loweredFunction.exported ?? false) ? '1' : '0',
          (loweredFunction.method ?? false) ? '1' : '0',
          (loweredFunction.main ?? false) ? '1' : '0',
          (loweredFunction.init ?? false) ? '1' : '0',
          `${loweredFunction.parameters ?? 0}`,
          `${loweredFunction.results ?? 0}`,
        ].join(':'),
        signature: [
          loweredFunction.name ?? '',
          (loweredFunction.exported ?? false) ? '1' : '0',
          (loweredFunction.method ?? false) ? '1' : '0',
          (loweredFunction.main ?? false) ? '1' : '0',
          (loweredFunction.init ?? false) ? '1' : '0',
          `${loweredFunction.parameters ?? 0}`,
          `${loweredFunction.results ?? 0}`,
        ].join(':'),
      })
    }
    for (const [declarationIndex, declaration] of (unit.declarations ?? []).entries()) {
      expectedPlaceholderBlocks.push({
        stage: 'declaration',
        index: declarationIndex,
        value: [
          'declaration',
          declaration.kind ?? '',
          declaration.name ?? '',
          (declaration.exported ?? false) ? '1' : '0',
          (declaration.method ?? false) ? '1' : '0',
        ].join(':'),
        signature: [
          declaration.kind ?? '',
          declaration.name ?? '',
          (declaration.exported ?? false) ? '1' : '0',
          (declaration.method ?? false) ? '1' : '0',
        ].join(':'),
      })
    }
    if (
      JSON.stringify((unit.placeholderBlocks ?? []).map((block) => ({
        stage: block.stage ?? '',
        index: block.index ?? 0,
        value: block.value ?? '',
        signature: block.signature ?? '',
      }))) !== JSON.stringify(expectedPlaceholderBlocks)
    ) {
      throw new Error('frontend backend result did not match backend input manifest')
    }
    const expectedLoweringBlocks: Array<{
      stage: string
      index: number
      value: string
    }> = []
    const unitLoweringPrefix = `tinygo_lower_unit_begin(${JSON.stringify(unit.id ?? '')}, ${JSON.stringify(unit.kind ?? '')}, ${JSON.stringify(unit.packageName ?? '')}, ${(unit.sourceFiles ?? []).length});`
    const unitLoweringSuffix = 'tinygo_lower_unit_end()'
    for (const [importIndex, loweredImport] of (unit.imports ?? []).entries()) {
      const importAlias = loweredImport.alias ?? ''
      const importPath = loweredImport.path ?? ''
      const importSignature = importAlias !== '' ? `${importAlias}=${importPath}` : importPath
      expectedLoweringBlocks.push({
        stage: 'import',
        index: importIndex,
        value: `${unitLoweringPrefix}tinygo_lower_import_begin();tinygo_emit_import_index(${importIndex});tinygo_emit_import_alias(${JSON.stringify(importAlias)});tinygo_emit_import_path(${JSON.stringify(importPath)});tinygo_emit_import_signature(${JSON.stringify(importSignature)});tinygo_lower_import_end();${unitLoweringSuffix}`,
      })
    }
    for (const [functionIndex, loweredFunction] of (unit.functions ?? []).entries()) {
      const functionSignature = [
        loweredFunction.name ?? '',
        (loweredFunction.exported ?? false) ? '1' : '0',
        (loweredFunction.method ?? false) ? '1' : '0',
        (loweredFunction.main ?? false) ? '1' : '0',
        (loweredFunction.init ?? false) ? '1' : '0',
        `${loweredFunction.parameters ?? 0}`,
        `${loweredFunction.results ?? 0}`,
      ].join(':')
      expectedLoweringBlocks.push({
        stage: 'function',
        index: functionIndex,
        value: `${unitLoweringPrefix}tinygo_lower_function_begin(${JSON.stringify(unit.packageName ?? '')}, ${JSON.stringify(loweredFunction.name ?? '')});tinygo_emit_function_index(${functionIndex});tinygo_emit_function_flags(${(loweredFunction.exported ?? false) ? 1 : 0}, ${(loweredFunction.method ?? false) ? 1 : 0}, ${(loweredFunction.main ?? false) ? 1 : 0}, ${(loweredFunction.init ?? false) ? 1 : 0});tinygo_emit_function_signature(${loweredFunction.parameters ?? 0}, ${loweredFunction.results ?? 0});tinygo_emit_function_stream(${JSON.stringify(functionSignature)});tinygo_lower_function_end();${unitLoweringSuffix}`,
      })
    }
    for (const [declarationIndex, declaration] of (unit.declarations ?? []).entries()) {
      const declarationSignature = [
        declaration.kind ?? '',
        declaration.name ?? '',
        (declaration.exported ?? false) ? '1' : '0',
        (declaration.method ?? false) ? '1' : '0',
      ].join(':')
      expectedLoweringBlocks.push({
        stage: 'declaration',
        index: declarationIndex,
        value: `${unitLoweringPrefix}tinygo_lower_declaration_begin(${JSON.stringify(unit.packageName ?? '')}, ${JSON.stringify(declaration.kind ?? '')}, ${JSON.stringify(declaration.name ?? '')});tinygo_emit_declaration_index(${declarationIndex});tinygo_emit_declaration_flags(${(declaration.exported ?? false) ? 1 : 0}, ${(declaration.method ?? false) ? 1 : 0});tinygo_emit_declaration_signature(${JSON.stringify(declarationSignature)});tinygo_lower_declaration_end();${unitLoweringSuffix}`,
      })
    }
    if (
      JSON.stringify((unit.loweringBlocks ?? []).map((block) => ({
        stage: block.stage ?? '',
        index: block.index ?? 0,
        value: block.value ?? '',
      }))) !== JSON.stringify(expectedLoweringBlocks)
    ) {
      throw new Error('frontend backend result did not match backend input manifest')
    }
  }
  if (JSON.stringify(loweredBitcodeManifest.bitcodeFiles ?? []) !== JSON.stringify(loweredBitcodeManifestFromResult.bitcodeFiles ?? [])) {
    throw new Error('frontend backend result did not match backend input manifest')
  }

  return {
    generatedFiles: backendResultManifest.generatedFiles ?? [],
    loweredSources: loweredSourcesManifest,
    loweredIR: loweredIRManifest,
    loweredBitcodeManifest: {
      bitcodeFiles: loweredBitcodeManifestFromResult.bitcodeFiles ?? [],
    },
    loweredCommandBatch: verifyLoweredCommandBatchAgainstCompileUnitAndLoweredSourcesManifest(
      {
        entryFile: backendInputManifest.entryFile,
        optimizeFlag: deriveOptimizeFlagFromBackendInputManifest(
          backendInputManifest,
          'frontend backend result did not match backend input manifest',
        ),
        toolchain: {
          target: 'wasm',
          llvmTarget: backendInputManifest.compileJobs?.[0]?.llvmTarget,
          linker: backendInputManifest.linkJob?.linker,
          cflags: backendInputManifest.compileJobs?.[0]?.cflags,
          ldflags: backendInputManifest.linkJob?.ldflags,
          artifactOutputPath: backendInputManifest.linkJob?.artifactOutputPath,
        },
      },
      loweredSourcesManifest,
      loweredCommandBatchManifest,
    ),
    loweredArtifact: verifyLoweredArtifactManifestAgainstLoweredCommandBatchManifest(
      loweredCommandBatchManifest,
      loweredArtifactManifest,
    ),
    commandArtifact: verifyCommandArtifactManifestAgainstBackendInputAndLoweredBitcodeManifest(
      backendInputManifest,
      loweredBitcodeManifest,
      commandArtifactManifest,
    ),
    commandBatch: verifyCommandBatchAgainstBackendInputManifest(
      backendInputManifest,
      commandBatchManifest,
    ),
  }
}

export const buildLoweredBitcodeCompileCommandsFromLoweringPlanAndLoweredSourcesManifest = (
  loweringPlanManifest: TinyGoLoweringPlanManifest,
  loweredSourcesManifest: TinyGoLoweredSourcesManifest,
): CompileUnitToolInvocation[] => {
  if ((loweringPlanManifest.entryFile ?? '') !== (loweredSourcesManifest.entryFile ?? '')) {
    throw new Error('frontend lowered bitcode compile commands did not match lowering plan and lowered sources manifests')
  }
  if ((loweringPlanManifest.optimizeFlag ?? '') !== (loweredSourcesManifest.optimizeFlag ?? '')) {
    throw new Error('frontend lowered bitcode compile commands did not match lowering plan and lowered sources manifests')
  }

  const loweredSourceUnitsByID = new Map(
    (loweredSourcesManifest.units ?? []).map((unit) => [unit.id ?? '', unit]),
  )
  const compileCommands = (loweringPlanManifest.compileJobs ?? []).map((compileJob) => {
    const loweredSourceUnit = loweredSourceUnitsByID.get(compileJob.id ?? '')
    if (
      !loweredSourceUnit ||
      (compileJob.kind ?? '') !== (loweredSourceUnit.kind ?? '') ||
      (compileJob.packageDir ?? '') !== (loweredSourceUnit.packageDir ?? '') ||
      JSON.stringify(compileJob.files ?? []) !== JSON.stringify(loweredSourceUnit.sourceFiles ?? []) ||
      typeof loweredSourceUnit.loweredSourcePath !== 'string' ||
      loweredSourceUnit.loweredSourcePath === '' ||
      typeof compileJob.llvmTarget !== 'string' ||
      compileJob.llvmTarget === '' ||
      typeof compileJob.bitcodeOutputPath !== 'string' ||
      compileJob.bitcodeOutputPath === ''
    ) {
      throw new Error('frontend lowered bitcode compile commands did not match lowering plan and lowered sources manifests')
    }
    return {
      argv: [
        '/usr/bin/clang',
        `--target=${compileJob.llvmTarget}`,
        ...((compileJob.optimizeFlag ?? '') === '' ? [] : [compileJob.optimizeFlag ?? '']),
        ...(compileJob.cflags ?? []),
        '-emit-llvm',
        '-c',
        loweredSourceUnit.loweredSourcePath,
        '-o',
        compileJob.bitcodeOutputPath,
      ],
      cwd: '/working',
    }
  })

  if (compileCommands.length !== (loweredSourcesManifest.units ?? []).length) {
    throw new Error('frontend lowered bitcode compile commands did not match lowering plan and lowered sources manifests')
  }

  return compileCommands
}

export const verifyLoweredBitcodeManifestAgainstLoweringPlanAndLoweredSourcesManifest = (
  loweringPlanManifest: TinyGoLoweringPlanManifest,
  loweredSourcesManifest: TinyGoLoweredSourcesManifest,
  loweredBitcodeManifest: TinyGoLoweredBitcodeManifest,
) => {
  const bitcodeFiles = buildLoweredBitcodeCompileCommandsFromLoweringPlanAndLoweredSourcesManifest(
    loweringPlanManifest,
    loweredSourcesManifest,
  ).map((command) => command.argv[command.argv.length - 1] ?? '')

  if (JSON.stringify(bitcodeFiles) !== JSON.stringify(loweredBitcodeManifest.bitcodeFiles ?? [])) {
    throw new Error('frontend lowered bitcode manifest did not match lowering plan and lowered sources manifests')
  }

  return {
    bitcodeFiles,
  }
}

export const verifyCommandArtifactManifestAgainstCommandBatchAndLoweredBitcodeManifest = (
  commandBatchManifest: TinyGoCommandBatchManifest,
  loweredBitcodeManifest: TinyGoLoweredBitcodeManifest,
  commandArtifactManifest: TinyGoCommandArtifactManifest,
) => {
  const linkArgv = commandBatchManifest.linkCommand?.argv ?? []
  const artifactOutputPath = linkArgv.length >= 2 ? linkArgv[linkArgv.length - 1] ?? '' : ''
  if (artifactOutputPath !== (commandArtifactManifest.artifactOutputPath ?? '')) {
    throw new Error('frontend command artifact manifest did not match command batch and lowered bitcode manifest')
  }
  if (JSON.stringify(loweredBitcodeManifest.bitcodeFiles ?? []) !== JSON.stringify(commandArtifactManifest.bitcodeFiles ?? [])) {
    throw new Error('frontend command artifact manifest did not match command batch and lowered bitcode manifest')
  }
  return {
    artifactOutputPath,
    bitcodeFiles: loweredBitcodeManifest.bitcodeFiles ?? [],
  }
}

export const verifyCommandArtifactManifestAgainstBackendInputAndLoweredBitcodeManifest = (
  backendInputManifest: TinyGoBackendInputManifest,
  loweredBitcodeManifest: TinyGoLoweredBitcodeManifest,
  commandArtifactManifest: TinyGoCommandArtifactManifest,
) => {
  const artifactOutputPath = backendInputManifest.linkJob?.artifactOutputPath ?? ''
  if (artifactOutputPath !== (commandArtifactManifest.artifactOutputPath ?? '')) {
    throw new Error('frontend command artifact manifest did not match backend input and lowered bitcode manifest')
  }
  if (JSON.stringify(loweredBitcodeManifest.bitcodeFiles ?? []) !== JSON.stringify(commandArtifactManifest.bitcodeFiles ?? [])) {
    throw new Error('frontend command artifact manifest did not match backend input and lowered bitcode manifest')
  }
  return {
    artifactOutputPath,
    bitcodeFiles: loweredBitcodeManifest.bitcodeFiles ?? [],
  }
}
