## ADDED Requirements

### Requirement: Finished runs are saved and reused
As soon as a run finishes, the runner SHALL save its outcome, reason and usage as
`.bench/runs/<workflow>/<task>/run-<n>.json`, with a fingerprint of its inputs: the model, the
pins, `fixture/tasks.json` (which holds the acceptance test command), the workflow's setup script, the
task's prompt script, `fixture/start/` as a run's workspace gets it (without its `node_modules` and
`.specjutsu/ledger`) and the task's golden tests. A run that timed out is reused only by a start
with the same `--timeout`. A cell with fewer saved runs than `--runs` but at least one SHALL show
how many are missing, and its workflow gets no total. It SHALL then rewrite `results/agent/results.json` and `results/agent/results.md` from
runs 1 to `--runs` of every workflow and task that are saved with the current fingerprint, and rewrite them once more when the start ends, even
if every run was already saved. A run that failed
because a `claude` call exited non-zero, was killed by a signal, or printed no result message SHALL NOT be saved, so the next
start does it again; a run that failed its acceptance tests or timed out is saved like a pass. A start
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

#### Scenario: AGENT-037 A start with nothing left to run still rewrites the results
- **WHEN** a start with `--runs 2` finishes, and the runner is started again with `--runs 1`
- **THEN** the second start makes no `claude` call, and `results/agent/results.md` shows each cell's pass rate out of 1

#### Scenario: AGENT-038 A run whose call errored is done again on the next start
- **WHEN** a start with `--runs 1` finishes with the fake `claude` exiting 1 on the first prompt of `openspec/bugfix` and timing out on the first prompt of `openspec/change`, and the runner is started again with `--runs 1 --timeout 1` and a `claude` that succeeds
- **THEN** the second start calls `claude` only for `openspec/bugfix`, and `openspec/change` keeps its saved `prompt 1: claude timed out after 1s`

#### Scenario: AGENT-039 A changed acceptance test command does every run again
- **WHEN** a start with `--runs 1` finishes, the `test` command in `fixture/tasks.json` is changed to another command that also passes, and the runner is started again with `--runs 1`
- **THEN** the second start calls `claude` for every cell

#### Scenario: AGENT-040 What a workspace doesn't get leaves the fingerprint alone
- **WHEN** `fixture/start/node_modules/x.js` and `fixture/start/.specjutsu/ledger/runs.jsonl` are written between two starts with `--runs 1`
- **THEN** the second start makes no `claude` call

#### Scenario: AGENT-041 Every other input changes the fingerprint
- **WHEN** the fingerprint of `speckit/feature` is taken, and then again after each one change: the model, a pin, `agents/speckit/setup.yaml`, a file in `fixture/start/`, a file in `fixture/golden/feature/test/`
- **THEN** each of the five fingerprints differs from the first

#### Scenario: AGENT-042 A timed-out run is done again under another timeout
- **WHEN** a start with `--runs 1 --timeout 1` saves `openspec/change` as `prompt 1: claude timed out after 1s`, and the runner is started again with `--runs 1 --timeout 2`
- **THEN** the second start calls `claude` only for `openspec/change`

#### Scenario: AGENT-043 A cell missing some runs shows it and gives no total
- **WHEN** after a start with `--runs 2`, run 2 of `speckit/bugfix` errored and was not saved while every other run passed
- **THEN** `results/agent/results.md` shows `speckit/bugfix` as `1/1 (1 not run)`, speckit's total as `—`, and the headline reads `speckit/bugfix: 1 not run` in place of the speckit saving

## MODIFIED Requirements

### Requirement: A run's usage is summed from every turn
The runner SHALL read the usage of every assistant turn in the stream-json output of every call in
a run. Claude Code prints one assistant line per content block, each repeating its message's usage,
so lines that share a `message.id` SHALL count as one turn, with the largest value each usage field
reaches on those lines. Turns of subagents the agent starts
(lines with a `parent_tool_use_id`) SHALL count like any other turn. A run's input tokens are the sum of `input_tokens`, `cache_creation_input_tokens` and
`cache_read_input_tokens`; its output tokens the sum of `output_tokens`; its cost the sum of
each call's reported `total_cost_usd`. A call that exits non-zero, prints no result message, or runs longer than the call timeout
(`--timeout <seconds>`, default 1800) marks the run failed with that reason, and the runner goes
on to the next run. Whether a failed run is saved follows the requirement on saved runs.

#### Scenario: AGENT-006 Input tokens include cache writes and reads
- **WHEN** a run's turns report `input_tokens` 1,000 and 400, `cache_creation_input_tokens` 200 and 0, `cache_read_input_tokens` 5,000 and 6,000, and `output_tokens` 300 and 100
- **THEN** the run records input tokens 12,600 and output tokens 400

#### Scenario: AGENT-017 Lines of one message count once
- **WHEN** a call prints three assistant lines with the same `message.id`, each with `input_tokens` 1,000 and `output_tokens` 50, and one more line with another id and `input_tokens` 2,000 and `output_tokens` 80
- **THEN** the run records input tokens 3,000, output tokens 130 and 2 turns

#### Scenario: AGENT-029 A message's usage is its largest on any of its lines
- **WHEN** two lines of message `m1` report `input_tokens` 1,000 on both and `output_tokens` 10 and then 50
- **THEN** the run records input tokens 1,000, output tokens 50 and 1 turn

#### Scenario: AGENT-024 A subagent's turns count
- **WHEN** a call prints one assistant line with `input_tokens` 1,000 and no `parent_tool_use_id`, and two subagent lines with `parent_tool_use_id` set and `input_tokens` 4,000 and 6,000
- **THEN** the run records input tokens 11,000 and 3 turns

#### Scenario: AGENT-007 A call that fails marks the run failed and the benchmark goes on
- **WHEN** the fake `claude` exits 1 on the second prompt of a run's first of three runs
- **THEN** the runner prints `speckit/feature run 1: prompt 2: claude exited 1 (not saved, will be retried)`, that run is not in the results, and the other two runs still run

#### Scenario: AGENT-016 A call that runs past the timeout fails the run
- **WHEN** the runner runs with `--timeout 1` and the fake `claude` sleeps 5 seconds on the first prompt
- **THEN** that run is recorded as failed with `prompt 1: claude timed out after 1s`
