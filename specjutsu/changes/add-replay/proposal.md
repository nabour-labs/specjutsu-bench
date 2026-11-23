## Why

specjutsu claims its workflow puts far less into an agent's context than Spec Kit + Superpowers
or OpenSpec + Superpowers, and its design targets at least 50% fewer tokens per completed change.
Nothing compares the three on the same work. `sj gain` counts specjutsu alone, on one machine,
against its own idea of what it replaced.

This change builds the benchmark's first layer: a deterministic replay that runs in CI. Each
workflow does the same three tasks on the same small TypeScript app, as a script of steps taken
from that tool's own docs and templates. The replay runs the real commands against pinned tool
versions and counts the bytes each step puts into context. Anyone can rerun it, and every step
names its source so a maintainer of any tool can challenge it.

## What Changes

- A fixture app (`fixture/`): a small TypeScript library with a Vitest suite, plus a golden end
  state for each of three tasks: a new feature, a bug fix and a change to existing behaviour.
- `pins.json`: the exact version of every tool (specjutsu, Spec Kit, OpenSpec, Superpowers).
- Step scripts (`steps/<tool>/<task>.yaml`): one per tool per task. Each step loads a tool file,
  reads a workspace file, runs a command or writes a golden file, and cites its source.
- The replay (`npm run replay`): validates pins and scripts, runs every script in a fresh copy of
  the fixture, and writes `results/results.json` and `results/results.md`.
- `npm run replay -- --check`: fails when fresh results differ from the committed ones. CI runs it
  on every pull request.
- A cross-check of the specjutsu script's `sj` command bytes against `sj gain --json`.

## Capabilities

### New Capabilities

- `steps`: pins and step scripts, and the checks that make them citable.
- `replay`: running the scripts, counting bytes, the results files and the drift check.

### Modified Capabilities

None.

## Impact

- New code in `src/` (the replay), data in `fixture/`, `steps/`, `pins.json` and `results/`.
- New dev dependency: `yaml` for the step scripts.
- CI installs the pinned tools with `npm run install-tools`: each tool's repository at its pinned
  tag or commit, and `sj`'s release binary. The rivals' CLIs aren't installed (see design.md).
- README: how to run the replay and read the results.
