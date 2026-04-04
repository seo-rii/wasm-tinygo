import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ensureTinyGoSourceReady } from './fetch-tinygo-source.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const goenvLLVMDefaultSource = `//go:build !wasip1

package goenv

import (
\t"strings"

\t"tinygo.org/x/go-llvm"
)

func llvmVersionMajor() string {
\treturn strings.Split(llvm.Version, ".")[0]
}
`

const goenvLLVMWasip1Source = `//go:build wasip1

package goenv

import "os"

func llvmVersionMajor() string {
\tif major := os.Getenv("TINYGO_LLVM_VERSION_MAJOR"); major != "" {
\t\treturn major
\t}
\treturn "20"
}
`

const tinyGoWasiProbeMainSource = `package main

import (
\t"encoding/json"
\t"fmt"
\t"os"

\t"github.com/tinygo-org/tinygo/compileopts"
)

type probeResult struct {
\tRequestedTarget string   \`json:"requestedTarget"\`
\tResolvedGOOS    string   \`json:"resolvedGoos"\`
\tResolvedGOARCH  string   \`json:"resolvedGoarch"\`
\tTriple          string   \`json:"triple"\`
\tBuildTags       []string \`json:"buildTags"\`
\tGC              string   \`json:"gc"\`
\tScheduler       string   \`json:"scheduler"\`
\tLinker          string   \`json:"linker"\`
}

func main() {
\ttargetName := os.Getenv("TINYGO_WASI_TARGET")
\tif targetName == "" {
\t\ttargetName = "wasip1"
\t}

\toptions := &compileopts.Options{
\t\tTarget: targetName,
\t\tGOOS:   "wasip1",
\t\tGOARCH: "wasm",
\t\tOpt:    "z",
\t}
\tif err := options.Verify(); err != nil {
\t\tfmt.Fprintln(os.Stderr, err)
\t\tos.Exit(1)
\t}

\ttarget, err := compileopts.LoadTarget(options)
\tif err != nil {
\t\tfmt.Fprintln(os.Stderr, err)
\t\tos.Exit(1)
\t}

\tconfig := &compileopts.Config{
\t\tOptions: options,
\t\tTarget:  target,
\t}

\tpayload := probeResult{
\t\tRequestedTarget: targetName,
\t\tResolvedGOOS:    config.GOOS(),
\t\tResolvedGOARCH:  config.GOARCH(),
\t\tTriple:          config.Triple(),
\t\tBuildTags:       config.BuildTags(),
\t\tGC:              config.GC(),
\t\tScheduler:       config.Scheduler(),
\t\tLinker:          target.Linker,
\t}

\tencoder := json.NewEncoder(os.Stdout)
\tencoder.SetIndent("", "  ")
\tif err := encoder.Encode(payload); err != nil {
\t\tfmt.Fprintln(os.Stderr, err)
\t\tos.Exit(1)
\t}
}
`

const patchGoenv = async (patchedRoot) => {
  const goenvPath = path.join(patchedRoot, 'goenv', 'goenv.go')
  const original = await readFile(goenvPath, 'utf8')
  const withoutLLVMImport = original.replace('\n\t"tinygo.org/x/go-llvm"', '')
  if (withoutLLVMImport === original) {
    throw new Error('failed to patch TinyGo goenv.go: llvm import not found')
  }
  const patched = withoutLLVMImport.replaceAll('strings.Split(llvm.Version, ".")[0]', 'llvmVersionMajor()')
  if (patched === withoutLLVMImport) {
    throw new Error('failed to patch TinyGo goenv.go: llvm version lookup not found')
  }
  await writeFile(goenvPath, patched)
  await writeFile(path.join(patchedRoot, 'goenv', 'llvm_version_default.go'), goenvLLVMDefaultSource)
  await writeFile(path.join(patchedRoot, 'goenv', 'llvm_version_wasip1.go'), goenvLLVMWasip1Source)
}

const writeProbeCommand = async (patchedRoot) => {
  const commandDir = path.join(patchedRoot, 'cmd', 'tinygo-wasi-probe')
  await mkdir(commandDir, { recursive: true })
  await writeFile(path.join(commandDir, 'main.go'), tinyGoWasiProbeMainSource)
}

export const prepareTinyGoWasiProbeSource = async () => {
  const source = await ensureTinyGoSourceReady()
  const patchedRoot =
    process.env.WASM_TINYGO_WASI_PROBE_SOURCE_ROOT ??
    path.join(rootDir, '.cache', 'tinygo-src-wasi-probe')
  await rm(patchedRoot, { recursive: true, force: true })
  await cp(source.rootPath, patchedRoot, { recursive: true })
  await patchGoenv(patchedRoot)
  await writeProbeCommand(patchedRoot)
  return {
    patchedRoot,
    sourceRef: source.sourceRef,
    sourceUrl: source.sourceUrl,
    sourceVersion: source.sourceVersion,
  }
}

const run = async () => {
  const result = await prepareTinyGoWasiProbeSource()
  console.log(`Prepared TinyGo WASI probe source at ${path.relative(rootDir, result.patchedRoot)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await run()
}
