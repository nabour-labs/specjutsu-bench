## Context

`runAll` keeps every run in memory and `cli.ts` writes `results/agent/` once, at the end. The
first real pass was stopped from outside after six of nine runs and lost them all. `runAll` also
clears every transcript before the first run.

## Goals / Non-Goals

**Goals:**

- Nothing finished is lost when a pass is interrupted.
- Starting the same command again continues where it stopped.
- One workflow can be run on its own without dropping the others from the report.

**Non-Goals:**

- Resuming inside a run. A run interrupted mid-prompt is done again from the start; its
  workspace is gone.
- Cleaning up the temporary area a killed runner leaves behind.
- Recovering the runs lost before this change: their workspaces are gone, so their acceptance
  result can't be known.

## Decisions

- **Saved runs live in `.bench/runs/`, one JSON file per run.** Writing one small file per finished
  run is atomic enough (write to a temp name, rename) and needs no lock. Rejected: appending to
  `results/agent/results.json` and reading it back, which mixes a committed report with working
  state and loses the fingerprint.
- **A fingerprint decides reuse.** sha256 over the model, `pins.json`, `fixture/tasks.json` (it
  holds the acceptance test command), the workflow's `setup.yaml`, the task's prompt script, the
  files under `fixture/start/` that a workspace gets (the same `node_modules` and
  `.specjutsu/ledger` exclusions as `copyStart`, from one shared list) and the task's golden tests
  (paths and bytes, sorted). A changed input means the saved run no longer measures the current
  benchmark, so it runs again. A timed-out run also records the `--timeout` it ran out of and is
  reused only under the same one. Rejected: reusing anything saved and relying on `--fresh`,
  which makes it easy to publish numbers from an old prompt. AGENT-041 pins inputs that were
  already hashed, so its red was recorded by dropping `setup.yaml` from the hash and restoring it.
- **The default start skips saved runs.** The same command that was interrupted continues it.
  `--fresh` is the explicit way to take new samples. Rejected: always rerunning unless a
  `--resume` flag is given, which repeats the costly mistake by default.
- **Results come from saved runs, rewritten after every run.** The report is always the current
  state of `.bench/runs/` for runs 1 to `--runs`, so a later `--runs 1` start doesn't show runs 2
  and 3 from an earlier `--runs 3` pass, and an interrupted pass leaves a partial but true report.
- **`not run` is its own cell state.** A cell with no saved run is reported as `not run`, not as
  `0/0` or as no passing run, so a partial report can't be read as a failure.

## Risks / Trade-offs

- [A setup step fails partway through a pass] -> As AGENT-003 already requires, the runner exits 1
  and leaves `results/agent/` as it was before the start. The runs saved before the failure stay in
  `.bench/runs/`, so the next start skips them and its report includes them.
- [`--fresh` and then a setup failure] -> `--fresh` discards before the first run, so a pass that
  fails in setup has already dropped those workflows' saved runs while `results/agent/` is put
  back as it was. That is what `--fresh` asks for; the next start rewrites the report.
- [An input outside the fingerprint changes, such as the installed `claude` version or the machine's
  `PATH`] -> Those were never pinned; `--fresh` takes new samples. The README says so.
- [The report is committed while some cells are `not run`] -> The headline names the missing cell
  instead of a saving, so a partial report can't produce a headline number.
