## Why

The first CI run of `npm run replay -- --check` on Linux drifted: `speckit/feature step 36: context 1101 → 1084`. That step runs a failing Vitest test, and Vite's stack frame names a file in the bench's symlinked `node_modules` by its path relative to the workspace (`../../../../../../../Users/<…>/specjutsu-bench/node_modules/vite/…`). That path depends on the temp directory's depth and on where the bench is checked out, so the count differs between machines.

## What Changes

- Before a `run` step's output is counted, the bench checkout's absolute path, and any `../`-relative path from the workspace into it, is replaced with `/bench`.
- The committed results are regenerated with the new normalisation.

## Capabilities

### New Capabilities

### Modified Capabilities

- `replay`: the deterministic-replay requirement also normalises the bench checkout's path.

## Impact

`src/replay.ts` (`normalizedBytes` and its caller), `test/replay.test.ts`, `results/results.json`, `results/results.md`.
