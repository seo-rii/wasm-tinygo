# wasm-tinygo

`wasm-tinygo` is a browser bootstrap for a future TinyGo-in-WASM toolchain.

The repository does not run the upstream TinyGo CLI in the browser yet. Instead, it proves the execution model around it: a browser-hosted LLVM toolchain, a Go/WASI planning stage, a browser-side front-end handoff, and a backend lowering/verification pipeline that produces real wasm artifacts.

Detailed compatibility and verification notes live in [COMPATIBILITY.md](/home/seorii/dev/hancomac/wasm-tinygo/COMPATIBILITY.md).

## Documentation

- [Architecture](/home/seorii/dev/hancomac/wasm-tinygo/docs/architecture.md)
- [Manifest chain](/home/seorii/dev/hancomac/wasm-tinygo/docs/manifests.md)
- [Development guide](/home/seorii/dev/hancomac/wasm-tinygo/docs/development.md)
- [Compatibility matrix](/home/seorii/dev/hancomac/wasm-tinygo/COMPATIBILITY.md)

## Status

- Browser execution path is working end to end.
- The app boots emception in the browser and executes generated `clang` and `wasm-ld` plans.
- The Go/WASI probe binary handles driver, front-end, and backend modes.
- The front-end and backend exchange normalized manifests and verify them on the host/browser side.
- The repository produces and validates both a bootstrap wasm artifact and a lowered wasm artifact.
- The real upstream TinyGo compiler pipeline is not embedded yet.

## What this repository demonstrates

1. Download and patch the published emception worker for local browser use.
2. Build `cmd/go-probe` into a WASI module that runs in the browser.
3. Accept a TinyGo-style build request and lower it into normalized planning artifacts.
4. Regenerate bootstrap and lowered C sources from front-end and backend handoff manifests.
5. Compile those sources with browser-hosted LLVM tools.
6. Verify the resulting wasm artifacts against the manifests and exported probe surface.

## Repository layout

- `cmd/go-probe`
  Single WASI entrypoint. It switches between driver, front-end, and backend modes through `WASM_TINYGO_MODE`.
- `internal/driver`
  Request parsing, package loading, import/module analysis, and planner invocation.
- `internal/tinygoplanner`
  TinyGo-style target resolution and bootstrap/front-end handoff manifest generation.
- `internal/tinygofrontend`
  Front-end handoff consumer, compile-unit generation, and lowering-plan emission.
- `internal/tinygobackend`
  Lowered source generation, lowered IR emission, command batch generation, and final artifact contracts.
- `src/main.ts`
  Browser app that drives emception, materializes files, executes plans, and verifies outputs.
- `src/bootstrap-exports.ts`
  Bootstrap wasm manifest reader and expectation verifier.
- `src/compile-unit.ts`
  Host/browser verifiers for compile-unit, intermediate, lowering, and backend manifests.
- `src/lowered-exports.ts`
  Lowered artifact export and object/bitcode/final wasm verifiers.
- `tests/`
  Host-side Node tests, WASI integration tests, and a browser smoke test.

## Getting started

### Prerequisites

- Node.js and npm
- Go

### Local development

```sh
npm install
npm run dev
```

`npm run dev` prepares the browser assets automatically before starting Vite.

### Production build

```sh
npm run build
```

## Commands

- `npm run prepare:assets`
  Fetches the emception worker and rebuilds the Go/WASI probe.
- `npm run dev`
  Prepares assets and starts the Vite dev server.
- `npm run build`
  Prepares assets and builds the production bundle.
- `npm run check`
  Runs TypeScript checking.
- `go test ./...`
  Runs the Go package tests.
- `npm run test:host`
  Runs Node-based host/verifier tests.
- `npm run test:wasi`
  Runs the WASI integration tests against the built probe module.
- `npm run test:browser`
  Runs the headless browser smoke test.

## Generated assets

These files are generated locally and intentionally ignored by git:

- `public/vendor/emception/emception.worker.js`
- `public/tools/go-probe.wasm`
- `.cache/`

Clone the repository, run the normal npm scripts, and let those assets be regenerated on demand.

## Scope

This repository is a bootstrap environment, not a drop-in replacement for the TinyGo CLI.

Today it focuses on:

- browser execution constraints
- manifest and handoff contracts
- lowering and artifact verification
- repeatable host/WASI/browser tests

It does not yet ship:

- the real upstream TinyGo compiler pipeline
- full TinyGo target compatibility
- a general-purpose browser TinyGo CLI
