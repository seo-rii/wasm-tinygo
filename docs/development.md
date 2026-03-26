# Development

## Prerequisites

- Node.js and npm
- Go

## Common workflow

```sh
npm install
npm run dev
```

The dev and build flows prepare browser-side assets automatically before starting Vite or producing a production build.

## Useful commands

- `npm run prepare:assets`
  Fetches the emception worker, vendors its runtime assets locally, and rebuilds the Go/WASI probe.
- `npm run dev`
  Starts the local app after preparing assets.
- `npm run build`
  Produces a production build after preparing assets.
- `npm run check`
  Runs TypeScript checking.
- `go test ./...`
  Runs Go unit tests for the internal packages.
- `npm run test:host`
  Runs Node-based host/verifier tests.
- `npm run test:wasi`
  Runs the built WASI probe through the integration suite.
- `npm run test:browser`
  Runs the browser smoke test in headless Chromium.

## Generated local files

These are generated locally and ignored by git:

- `public/vendor/emception/`
- `public/tools/go-probe.wasm`
- `.cache/`
- `dist/`

Do not treat those as source files. Regenerate them through the normal npm scripts.

## Test strategy

### Go tests

`go test ./...` covers planner, bootstrap, target, front-end, backend, and driver behavior inside Go packages.

### Host tests

`npm run test:host` checks the browser-host verifier layer and asset/materialization helpers in Node.

### WASI tests

`npm run test:wasi` executes the built `go-probe.wasm` module in driver, front-end, and backend modes.

### Browser smoke

`npm run test:browser` builds the app, boots emception, runs the planned commands, and verifies the resulting wasm artifacts through headless Chromium.

In restricted environments the browser smoke test may skip when loopback listen or browser launch is not allowed.

## Documentation map

- `README.md`
  Project entry point.
- `docs/architecture.md`
  High-level stage layout and ownership.
- `docs/roadmap.md`
  Remaining milestones toward the first real TinyGo demo.
- `docs/manifests.md`
  Manifest and artifact chain overview, including the current front-end handoff contract.
- `COMPATIBILITY.md`
  Compatibility claims and the tests backing them.
