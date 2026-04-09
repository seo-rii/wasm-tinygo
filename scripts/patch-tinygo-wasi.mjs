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

  const browserCommandDir = path.join(sourceRoot, 'cmd', 'tinygo-browser')
  await mkdir(browserCommandDir, { recursive: true })
  await writeFile(
    path.join(browserCommandDir, 'main.go'),
    `package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"${modulePath}/builder"
	"${modulePath}/compileopts"
)

func copyFile(src, dst string) error {
	source, err := os.Open(src)
	if err != nil {
		return err
	}
	defer source.Close()

	st, err := source.Stat()
	if err != nil {
		return err
	}

	destination, err := os.OpenFile(dst, os.O_RDWR|os.O_CREATE|os.O_TRUNC, st.Mode())
	if err != nil {
		return err
	}
	defer destination.Close()

	_, err = io.Copy(destination, source)
	return err
}

func buildPackage(pkgName, outpath string, config *compileopts.Config) error {
	tmpdir, err := os.MkdirTemp("", "tinygo-browser")
	if err != nil {
		return err
	}
	if !config.Options.Work {
		defer os.RemoveAll(tmpdir)
	}

	result, err := builder.Build(pkgName, outpath, tmpdir, config)
	if err != nil {
		return err
	}

	if result.Binary == "" {
		return nil
	}

	if outpath == "" {
		if strings.HasSuffix(pkgName, ".go") {
			outpath = filepath.Base(pkgName[:len(pkgName)-3]) + config.DefaultBinaryExtension()
		} else {
			outpath = filepath.Base(result.MainDir) + config.DefaultBinaryExtension()
		}
	}

	if err := os.Rename(result.Binary, outpath); err != nil {
		return copyFile(result.Binary, outpath)
	}

	return nil
}

func printCommand(cmd string, args ...string) {
	command := append([]string{cmd}, args...)
	for i, arg := range command {
		const specialChars = "~\`#$&*()\\\\|[]{};'\\\"<>?! "
		if strings.ContainsAny(arg, specialChars) {
			command[i] = "'" + strings.ReplaceAll(arg, "'", "'\\\\''") + "'"
		}
	}
	fmt.Fprintln(os.Stderr, strings.Join(command, " "))
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: tinygo-browser build [flags] [package]")
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	command := os.Args[1]
	if command != "build" {
		fmt.Fprintf(os.Stderr, "unsupported tinygo-browser command %q\\n", command)
		usage()
		os.Exit(1)
	}

	flags := flag.NewFlagSet("build", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)

	opt := flags.String("opt", "z", "optimization level")
	gc := flags.String("gc", "", "garbage collector")
	panicStrategy := flags.String("panic", "print", "panic strategy")
	scheduler := flags.String("scheduler", "", "scheduler")
	serial := flags.String("serial", "", "serial mode")
	work := flags.Bool("work", false, "keep the temporary work directory")
	interpTimeout := flags.Duration("interp-timeout", 180*time.Second, "interp optimization pass timeout")
	tagsValue := flags.String("tags", "", "space-separated build tags")
	target := flags.String("target", "", "target name")
	buildMode := flags.String("buildmode", "", "build mode")
	parallelism := flags.Int("p", runtime.GOMAXPROCS(0), "parallel build jobs")
	nodebug := flags.Bool("no-debug", false, "strip debug information")
	nobounds := flags.Bool("nobounds", false, "disable bounds checks")
	programmer := flags.String("programmer", "", "programmer name")
	llvmFeatures := flags.String("llvm-features", "", "comma separated LLVM features")
	printCommands := flags.Bool("x", false, "print commands")
	gocompatibility := flags.Bool("go-compatibility", true, "enable Go compatibility checks")
	outpath := flags.String("o", "", "output path")

	if err := flags.Parse(os.Args[2:]); err != nil {
		os.Exit(1)
	}

	pkgName := "."
	if flags.NArg() == 1 {
		pkgName = filepath.ToSlash(flags.Arg(0))
	} else if flags.NArg() > 1 {
		fmt.Fprintln(os.Stderr, "build only accepts a single positional argument")
		usage()
		os.Exit(1)
	}

	queueSize := *parallelism
	if queueSize < 1 {
		queueSize = 1
	}

	options := &compileopts.Options{
		GOOS:            os.Getenv("GOOS"),
		GOARCH:          os.Getenv("GOARCH"),
		GOARM:           os.Getenv("GOARM"),
		GOMIPS:          os.Getenv("GOMIPS"),
		Target:          *target,
		BuildMode:       *buildMode,
		Opt:             *opt,
		GC:              *gc,
		PanicStrategy:   *panicStrategy,
		Scheduler:       *scheduler,
		Serial:          *serial,
		Work:            *work,
		InterpTimeout:   *interpTimeout,
		Semaphore:       make(chan struct{}, queueSize),
		Debug:           !*nodebug,
		Nobounds:        *nobounds,
		Tags:            strings.Fields(*tagsValue),
		Programmer:      *programmer,
		LLVMFeatures:    *llvmFeatures,
		GoCompatibility: *gocompatibility,
	}
	if *printCommands {
		options.PrintCommands = printCommand
	}

	if err := options.Verify(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	if filepath.Ext(*outpath) == ".wasm" && options.GOARCH != "wasm" && options.Target == "" {
		fmt.Fprintln(os.Stderr, "you appear to want to build a wasm file, but have not specified either a target flag, or the GOARCH/GOOS to use.")
		os.Exit(1)
	}

	config, err := builder.NewConfig(options)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	if err := buildPackage(pkgName, *outpath, config); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
`,
  )

  const commandDir = path.join(sourceRoot, 'cmd', 'tinygo-wasi')
  await mkdir(commandDir, { recursive: true })
  const commandSource = await readFile(PROBE_COMMAND_SOURCE, 'utf8')
  await writeFile(path.join(commandDir, 'main.go'), rewriteImports(commandSource, modulePath))

  return {
    commandPath: './cmd/tinygo-browser',
    probeCommandPath: './cmd/tinygo-wasi',
    copiedFileCount: copiedFiles.length + 2,
    modulePath,
    sourceRoot,
  }
}

const run = async () => {
  const source = await ensureTinyGoSourceReady()
  const result = await patchTinyGoSourceForWasi(source.rootPath)
  console.log(`Patched TinyGo source for WASI at ${result.sourceRoot}`)
  console.log(`tinygo browser command: ${result.commandPath}`)
  console.log(`tinygo probe command: ${result.probeCommandPath}`)
  console.log(`copied files: ${result.copiedFileCount}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await run()
}
