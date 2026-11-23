# specjutsu-bench

A reproducible token benchmark for spec-driven development workflows. It runs the same tasks on
the same small TypeScript app with three setups and counts what each one puts into the agent's
context:

- specjutsu
- Spec Kit + Superpowers
- OpenSpec + Superpowers

Every tool is pinned to an exact version, and every step the benchmark replays cites the doc or
template it comes from, so anyone can rerun it and challenge a step.

Status: layer 1 (the replay) runs in CI. Its current results are in
[results/results.md](results/results.md).

## Layers

1. **Replay (CI).** Scripted steps per tool and task, run against the pinned versions. Counts the
   bytes each step puts into context. Deterministic, runs on every pull request.
2. **Agent runs (periodic).** A real agent does the tasks with each setup, and tokens are counted
   from the transcripts. Planned.

## Running the replay

You need Node 22.18 or later, git 2.29 or later and curl.

```bash
npm ci
npm run install-tools
npm run replay
```

- `npm run install-tools` puts every tool from `pins.json` into `.bench/tools/<tool>@<pin>/`. Each
  install is that tool's repository at tag `v<pin>`. specjutsu also gets its release binary in
  `bin/sj`, checked against the release's `SHA256SUMS`. An install that is already there is kept.
- `npm run replay` checks the pins, the step scripts and the fixture, replays every script in a
  fresh workspace, and writes `results/results.json` and `results/results.md`. It exits 1 and
  writes nothing if any check fails.
- `npm run replay -- --check` replays without writing and compares against the committed results.
  It prints `results match`, or the first difference (a pin change first, then the first step
  whose bytes moved), and exits 1. CI runs this on every pull request.

## Reading the results

`results/results.md` has one row per tool and task, and a total per tool:

- **context bytes:** what the workflow put into the agent's context: every file loaded or read,
  and the output of every command run. Run output is counted after durations, clock times and the
  workspace path are replaced with fixed values, so it is the same on every machine.
- **context tokens:** context bytes / 4, an estimate, as in `sj gain`.
- **output bytes:** the files the agent writes. Every tool writes the same code and tests, and its
  own spec documents carrying the same requirements, so this column is roughly equal by design.

The headline compares context bytes only: `specjutsu saves N% vs speckit, M% vs openspec`.
`results/results.json` holds the same numbers per step, with each step's kind, path or command.

## What is replayed

- `fixture/start/` is a small invoice library with a Vitest suite. `fixture/tasks.json` names three
  tasks: a feature (payment terms), a bug fix (a bulk-discount boundary) and a change (a higher
  free-shipping threshold).
- `fixture/golden/<task>/` holds what the agent writes for each task: the code, the tests and each
  tool's spec documents. The replay checks that the start state and every golden end state pass
  their tests before replaying anything.
- `steps/<tool>/<task>.yaml` is the script for one tool and task. `steps/<tool>/session.yaml` lists
  the files the tool loads at the start of every agent session. Each step is one of:
  - `load`: a file from the pinned install (a skill or a command template),
  - `read`: a file in the workspace,
  - `run`: a command in the workspace,
  - `write`: a golden file the agent writes,
  - `session`: a new agent session, which pays the session-start files again.
- The specjutsu scripts' `sj` command bytes are also checked against what `sj gain --json`
  recorded for the same runs.

## Challenging a step

Every step has a `source`, `<tool>@<pin>:<path>#L<a>-L<b>` or a URL, naming the doc line that
prescribes it. Where a tool's docs leave a choice, the script takes the reading that costs that
tool the least and says so in the step's `note`. If a step misreads a tool's docs, open an issue
or a pull request that changes the step and cites the doc. CI will show how the results move.

This repo is built with [specjutsu](https://github.com/nabour-labs/specjutsu).
