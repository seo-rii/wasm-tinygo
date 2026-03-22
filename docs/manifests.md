# Manifest chain

The repository is built around explicit handoff files between stages.

Each stage owns the artifacts it derives. Later stages consume those artifacts instead of reconstructing hidden state from earlier steps.

## Primary flow

| Artifact | Producer | Consumer | Purpose |
| --- | --- | --- | --- |
| `/workspace/tinygo-request.json` | browser host / caller | driver | TinyGo-style build request |
| `/workspace/tinygo-result.json` | driver | browser host | initial plan result plus generated bootstrap/front-end files |
| `/working/tinygo-bootstrap.json` | planner | browser host | normalized bootstrap manifest and dispatch list |
| `/working/tinygo-frontend-input.json` | planner | front-end stage | front-end handoff contract |
| `/working/tinygo-frontend-result.json` | front-end stage | browser host | front-end execution result envelope |
| `/working/tinygo-compile-unit.json` | front-end stage | browser host | bootstrap compile-unit source of truth |
| `/working/tinygo-intermediate.json` | front-end stage | host verifiers | resolved compile graph for the next stages |
| `/working/tinygo-lowering-input.json` | front-end stage | host verifiers | lowering-specific grouping and support files |
| `/working/tinygo-work-items.json` | front-end stage | host verifiers | deterministic lowering work graph |
| `/working/tinygo-lowering-plan.json` | front-end stage | host verifiers / backend | compile/link lowering plan |
| `/working/tinygo-backend-input.json` | front-end stage | backend stage | backend-owned lowering input contract |
| `/working/tinygo-backend-result.json` | backend stage | browser host | backend execution result envelope |
| `/working/tinygo-lowered-sources.json` | backend stage | browser host / verifiers | lowered source ownership and paths |
| `/working/tinygo-lowered-ir.json` | backend stage | browser host / verifiers | lowered IR summaries, placeholder blocks, lowering blocks |
| `/working/tinygo-lowered-bitcode.json` | backend stage | browser host / verifiers | lowered bitcode outputs |
| `/working/tinygo-lowered-command-batch.json` | backend stage | browser host | executable lowered object command batch |
| `/working/tinygo-lowered-artifact.json` | backend stage | browser host / verifiers | lowered wasm artifact contract |
| `/working/tinygo-command-batch.json` | backend stage | browser host | final bitcode command batch |
| `/working/tinygo-command-artifact.json` | backend stage | browser host / verifiers | final wasm artifact contract |

## Design rules

### Ownership stays local

Derived fields stay with the stage that computes them.

For example:

- the planner owns bootstrap dispatch
- the front-end owns compile/lowering handoff manifests
- the backend owns lowered sources, lowered IR, and final command artifacts

### Normalized nested sections are the source of truth

The repository prefers normalized nested contracts such as:

- `toolchain`
- `sourceSelection`
- `compileInputs`
- `bootstrapDispatch`

Legacy top-level mirrors are intentionally rejected by the verifier layer instead of being silently accepted.

### Verifiers run at multiple boundaries

The same artifacts are checked in several contexts:

- Go unit tests for planner/front-end/backend behavior
- Node-based host verifier tests
- WASI integration tests against the built probe
- browser smoke tests against the real built app

## Practical reading order

When debugging a run, the shortest useful order is usually:

1. `tinygo-request.json`
2. `tinygo-result.json`
3. `tinygo-frontend-input.json`
4. `tinygo-compile-unit.json`
5. `tinygo-backend-input.json`
6. `tinygo-backend-result.json`
7. lowered/final artifact manifests

## Where the verifiers live

- bootstrap artifact verification: `src/bootstrap-exports.ts`
- compile/lowering/backend manifest verification: `src/compile-unit.ts`
- lowered wasm/object/bitcode/final artifact verification: `src/lowered-exports.ts`
