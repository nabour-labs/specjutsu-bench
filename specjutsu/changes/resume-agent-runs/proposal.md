## Why

The first real agent run was stopped from outside after six of its nine runs, about $11 of API
usage in, and left no results: the runner keeps every run's outcome in memory and writes
`results/agent/` only once every run is done, and it can't be told to run less than every
workflow. Each interruption throws all finished runs away, and a full pass at the default three
runs per cell is around $45.

## What Changes

- Each run, once it finishes, is saved under `.bench/runs/<workflow>/<task>/run-<n>.json` with
  its outcome, reason, usage and a fingerprint of its inputs, and `results/agent/` is rewritten
  from every saved run.
- A start skips any run that is already saved with the same fingerprint, so starting again after
  an interruption runs only what's missing. A saved run whose inputs changed runs again.
- A run that failed because a `claude` call errored (non-zero exit, no result message) isn't
  saved, so an API outage, rate limit or exhausted credit is retried on the next start instead of
  counting against the workflow. Acceptance failures and timeouts are saved.
- `--workflow <name>` runs only that workflow; the other workflows' saved runs still go into the
  results. An unknown name is refused before any run.
- `--fresh` discards the saved runs of the workflows being run, for new samples.
- A cell with no saved run shows as `not run` in `results/agent/results.md`.
- Transcripts are cleared per run as it starts, not all at once, so skipped runs keep theirs.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-runs`: finished runs are saved, reused on the next start, and selectable by workflow.

## Impact

- Code: `src/agents/cli.ts`, `src/agents/run.ts`, `src/agents/results.ts`, a new
  `src/agents/saved.ts`.
- Tests: `test/agents.test.ts`, `test/agent-helpers.ts` (the fake `claude`).
- README: the "Running the agent runs" section.
- No new dependencies. `.bench/` is already ignored by git.
