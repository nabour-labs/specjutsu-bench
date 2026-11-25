## ADDED Requirements

### Requirement: Finished runs are saved and reused
As soon as a run finishes, the runner SHALL save its outcome, reason and usage as
`.bench/runs/<workflow>/<task>/run-<n>.json`, with a fingerprint of its inputs: the model, the
pins, the workflow's setup script, the task's prompt script, `fixture/start/` and the task's golden
tests. It SHALL then rewrite `results/agent/results.json` and `results/agent/results.md` from
runs 1 to `--runs` of every workflow and task that are saved with the current fingerprint. A start
SHALL skip a run that is already saved with the current fingerprint, and do again one whose
fingerprint differs. `--workflow <name>` SHALL limit the runs to that workflow while the other
workflows' saved runs still go into the results; a name that is not a workflow MUST be refused
before any run. `--fresh` SHALL discard the saved runs of the workflows being run before the first
run. A run's transcripts SHALL be cleared only when that run starts. A cell with no saved run SHALL
show `not run` in `results/agent/results.md`, and the headline names it as
`<workflow>/<task>: not run` where it would name a cell with no passing run.

#### Scenario: AGENT-030 A finished run is in the results before the next run starts
- **WHEN** the runner does two runs of every cell and the fake `claude`, on the first call of run 2 of `specjutsu/feature`, records `results/agent/results.json`
- **THEN** the recorded results hold run 1 of `specjutsu/feature` with its outcome and input tokens

#### Scenario: AGENT-031 A second start does only the runs not yet saved
- **WHEN** a start with `--runs 1` finishes, and the runner is started again with `--runs 2`
- **THEN** the second start calls `claude` only for run 2 of each cell, and `results/agent/results.md` shows each cell's pass rate out of 2

#### Scenario: AGENT-032 A run whose inputs changed runs again
- **WHEN** a start with `--runs 1` finishes, the prompt in `agents/speckit/feature.yaml` is changed, and the runner is started again with `--runs 1`
- **THEN** the second start calls `claude` only for `speckit/feature`

#### Scenario: AGENT-033 --workflow runs one workflow and keeps the others' runs
- **WHEN** a start with `--runs 1` finishes, and the runner is started again with `--runs 1 --workflow openspec --fresh`
- **THEN** the second start calls `claude` only for `openspec` cells, and `results/agent/results.json` still holds the first start's `specjutsu` and `speckit` runs

#### Scenario: AGENT-034 An unknown workflow is refused
- **WHEN** the runner is started with `--workflow spec-kit`
- **THEN** it prints `--workflow must be one of specjutsu, speckit, openspec`, exits 1, makes no `claude` call and leaves `results/agent/` unchanged

#### Scenario: AGENT-035 --fresh does a workflow's saved runs again
- **WHEN** a start with `--runs 1` finishes, and the runner is started again with `--runs 1 --workflow speckit --fresh`
- **THEN** the second start calls `claude` for every `speckit` cell and for no other workflow

#### Scenario: AGENT-036 A cell with no saved run shows as not run
- **WHEN** the first start ever is with `--runs 1 --workflow specjutsu`
- **THEN** `results/agent/results.md` shows every `speckit` and `openspec` cell as `not run`, and the headline reads `speckit/feature: not run` and `openspec/feature: not run` in place of their savings
