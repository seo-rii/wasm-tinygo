# Roadmap

This roadmap tracks the shortest path from the current bootstrap pipeline to the first convincing TinyGo-in-browser demo.

## Goal

The first demo means:

- a non-trivial Go program is compiled in the browser
- the front-end is backed by real TinyGo compiler logic instead of the current synthetic bootstrap/front-end handoff
- the backend path is no longer just a placeholder lowered-C generator
- the browser still executes and verifies the final wasm artifact end to end

## Current state

What already works:

- browser-side emception boot and command execution
- Go/WASI driver, front-end, and backend stage boundaries
- normalized manifest chain with host/browser verification
- bootstrap wasm artifact generation
- lowered wasm artifact generation and probe verification

What is still synthetic:

- the front-end does not yet run the real TinyGo compiler pipeline
- the backend does not yet lower through real TinyGo compiler output

## Execution order

### 1. Make the front-end handoff explicit enough for a real TinyGo frontend

The current handoff is still bootstrap-oriented. The first step is to make package graph ownership explicit and future-proof the front-end input contract.

Near-term slices:

- carry explicit compile units/package graph in `tinygo-frontend-input.json`
- tighten front-end validation around that package graph
- keep host/WASI/browser verification aligned with the stronger handoff
- attach package metadata needed by a real TinyGo frontend instead of only file grouping

### 2. Replace the synthetic front-end with a build-only TinyGo front-end

Once the handoff is strong enough, the next milestone is swapping out the synthetic front-end logic for real TinyGo compiler analysis.

Expected deliverables:

- build-only TinyGo frontend mode in `cmd/go-probe`
- real package/type analysis from browser materialized sources
- compile-unit/lowering manifests derived from real TinyGo frontend state

### 3. Replace placeholder lowered-C generation with real backend integration

After the real frontend is present, the backend needs to stop inventing placeholder lowered sources and start consuming real compiler output.

Expected deliverables:

- backend input derived from real TinyGo frontend output
- real lowering/backend bridge instead of synthetic lowered C
- final wasm artifact still verified in the browser host

### 4. Expand the demo from “works once” to “repeatable”

The first convincing demo needs stable examples and regression coverage.

Expected deliverables:

- one or more non-trivial demo programs
- browser smoke coverage against those programs
- clearer failure modes for unsupported language/target cases

## Immediate next slice

The current next slice is still inside step 1:

- keep `compileUnits` as the source of truth for package grouping
- extend each compile unit with package metadata such as `importPath` and `packageName`
- update the front-end and host verifiers to reject incomplete package metadata
