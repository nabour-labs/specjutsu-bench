# agent-runs Specification

## Purpose
Layer 2 of the benchmark: run Claude Code through each workflow, installed with its own installer, on the same tasks as the replay, count the tokens the model processed, and report each cell's median over runs that pass the golden acceptance tests.

## Requirements

### Requirement: Each run drives Claude Code through the workflow's prompt script
For every workflow and task, the runner SHALL copy `fixture/start/` into a fresh workspace, run
the workflow's `agents/<workflow>/setup.yaml` commands there, and then send each prompt in
`agents/<workflow>/<task>.yaml` to `claude -p --output-format stream-json` in order, with the
model `agents/agents.json` pins (`{"model": "claude-sonnet-5-5"}`), a full model ID changed only
by editing that file. A prompt continues the current session (`--resume <session id>`)
unless a `session` entry precedes it, which starts a new one. Claude Code SHALL run with its own
empty configuration directory, so the machine's user settings, memory and plugins never enter the
run. Each run SHALL also get its own empty `HOME`, with `$HOME/.local/bin`
first on `PATH` for setup commands and `claude` calls alike, so installers never write to the
machine's home and the tools they install are found by the agent. `ANTHROPIC_API_KEY` SHALL
reach the `claude` calls and never the setup commands, and the runner MUST refuse to start without
it. Wherever the key's value appears in a saved transcript it SHALL be replaced with `[redacted]`.
Each run SHALL get its own copy of the bench's `node_modules`, never a link to it, and a fixed git
identity (`bench <bench@localhost>`) for any commit the agent makes. Like the
replay's, each workspace SHALL be a git repo with the start state committed on `main` before setup.
`--runs` and `--timeout` MUST be positive integers, and `claude` MUST be on PATH; otherwise the
runner prints why, exits 1 before any run, and writes no results.

#### Scenario: AGENT-001 Prompts run in order, and a session entry starts a new session
- **WHEN** `agents/speckit/feature.yaml` holds prompt A, prompt B, a `session` entry and prompt C, and the fake `claude` answers each call with a new session id
- **THEN** `claude` is called three times in order, each with `--model claude-sonnet-5-5`: A with no `--resume`, B with `--resume` and A's session id, and C with no `--resume`

#### Scenario: AGENT-002 The machine's Claude Code configuration doesn't reach a run
- **WHEN** the runner starts with `CLAUDE_CONFIG_DIR` pointing at a directory that holds a `CLAUDE.md`, and the fake `claude` prints the `CLAUDE_CONFIG_DIR` it sees
- **THEN** that directory is a fresh, empty one inside the run's temporary area, not the machine's

#### Scenario: AGENT-003 A failing setup command stops the benchmark
- **WHEN** the first command in `agents/speckit/setup.yaml` exits 1
- **THEN** the runner prints `speckit setup step 1: exited 1`, exits 1 and writes no results

#### Scenario: AGENT-014 Setup commands never see the API key
- **WHEN** the runner starts with `ANTHROPIC_API_KEY=sk-test` set, a setup command prints whether `ANTHROPIC_API_KEY` is set, and the fake `claude` records the value it sees
- **THEN** the setup command sees it unset and every `claude` call sees `sk-test`

#### Scenario: AGENT-015 The workspace is a git repo with the start state committed
- **WHEN** the fake `claude` records `git log --format=%s main` in its working directory
- **THEN** it records one commit, `fixture start`

#### Scenario: AGENT-023 Each run has its own home, and what setup installs there is on PATH
- **WHEN** a setup command writes an executable `$HOME/.local/bin/hello`, and the fake `claude` records `$HOME` and the output of `hello`
- **THEN** every run's `HOME` is a different, fresh directory inside its temporary area, the machine's home holds no `.local/bin/hello`, and `claude` records `hello`'s output

#### Scenario: AGENT-025 A run can't change the bench's packages
- **WHEN** the fake `claude` writes `node_modules/.agent-was-here` in its workspace on the first run
- **THEN** the bench's `node_modules` holds no `.agent-was-here`, and neither does the second run's workspace

#### Scenario: AGENT-026 The agent can commit
- **WHEN** the fake `claude` runs `git commit --allow-empty -m work` in its workspace
- **THEN** the commit succeeds with author `bench <bench@localhost>`

#### Scenario: AGENT-027 The API key never reaches a saved transcript
- **WHEN** `ANTHROPIC_API_KEY=sk-test-123` is set and the fake `claude` prints a line containing `sk-test-123`
- **THEN** the saved transcript holds `[redacted]` in its place and no `sk-test-123`

#### Scenario: AGENT-028 A missing API key stops the benchmark
- **WHEN** `ANTHROPIC_API_KEY` is not set
- **THEN** the runner prints `ANTHROPIC_API_KEY is not set`, exits 1, makes no `claude` call and leaves `results/agent/` unchanged

#### Scenario: AGENT-019 A run count that isn't a positive integer is refused
- **WHEN** the runner is started with `--runs 0`
- **THEN** it prints `--runs must be a positive integer`, exits 1, makes no `claude` call and leaves `results/agent/` unchanged

#### Scenario: AGENT-020 A timeout that isn't a positive integer is refused
- **WHEN** the runner is started with `--timeout abc`
- **THEN** it prints `--timeout must be a positive integer`, exits 1, runs no setup command and leaves `results/agent/` unchanged

#### Scenario: AGENT-021 A missing claude CLI stops the benchmark
- **WHEN** no `claude` is on PATH
- **THEN** the runner prints `claude not found on PATH`, exits 1 and leaves `results/agent/` unchanged

### Requirement: Prompt and setup scripts cite their sources
Every prompt and every setup command SHALL carry a `source`, checked before any run with the
same rules as a step script's sources (form, pinned tool, pin, file and line range). Every
workflow MUST have a setup script and one prompt script per task in `fixture/tasks.json`, and every
task MUST have a `fixture/golden/<task>/test/` directory for the acceptance check. A failed
check exits 1, names the script and the entry, and writes no results.

#### Scenario: AGENT-004 A prompt citing another version is refused
- **WHEN** `pins.json` pins `speckit` to `1.4.3` and the second prompt in `agents/speckit/feature.yaml` cites `speckit@1.4.2:templates/commands/plan.md`
- **THEN** the runner prints `agents/speckit/feature.yaml prompt 2: source cites speckit@1.4.2, but speckit is pinned to 1.4.3` and exits 1

#### Scenario: AGENT-005 A missing prompt script is refused
- **WHEN** `fixture/tasks.json` lists `feature`, `bugfix` and `change` and `agents/openspec/bugfix.yaml` does not exist
- **THEN** the runner prints `missing agents/openspec/bugfix.yaml` and exits 1

#### Scenario: AGENT-022 A task without golden tests is refused
- **WHEN** `fixture/golden/change/test/` does not exist
- **THEN** the runner prints `fixture/golden/change/test: missing` and exits 1

### Requirement: A run's usage is summed from every turn
The runner SHALL read the usage of every assistant turn in the stream-json output of every call in
a run. Claude Code prints one assistant line per content block, each repeating its message's usage,
so lines that share a `message.id` SHALL count as one turn, with the largest value each input field
reaches on those lines. Turns of subagents the agent starts
(lines with a `parent_tool_use_id`) SHALL count like any other turn. A run's input tokens are the sum of `input_tokens`, `cache_creation_input_tokens` and
`cache_read_input_tokens`; its output tokens the sum of each call's result message
`usage.output_tokens`, since an assistant line carries its message's output count as it was when
the line was printed, not the final count; its cost the sum of each call's reported `total_cost_usd`. A call that exits non-zero, prints no result message, or runs longer than the call timeout
(`--timeout <seconds>`, default 1800) marks the run failed with that reason, and the runner goes
on to the next run. Whether a failed run is saved follows the requirement on saved runs.

#### Scenario: AGENT-006 Input tokens include cache writes and reads
- **WHEN** a run's turns report `input_tokens` 1,000 and 400, `cache_creation_input_tokens` 200 and 0, `cache_read_input_tokens` 5,000 and 6,000, and `output_tokens` 300 and 100, and the call's result message reports `usage.output_tokens` 450
- **THEN** the run records input tokens 12,600 and output tokens 450

#### Scenario: AGENT-017 Lines of one message count once
- **WHEN** a call prints three assistant lines with the same `message.id`, each with `input_tokens` 1,000 and `output_tokens` 50, one more line with another id and `input_tokens` 2,000 and `output_tokens` 80, and a result message with `usage.output_tokens` 300
- **THEN** the run records input tokens 3,000, output tokens 300 and 2 turns

#### Scenario: AGENT-029 A message's usage is its largest on any of its lines
- **WHEN** two lines of message `m1` report `input_tokens` 1,000 on both, `cache_read_input_tokens` 5,000 and then 4,000, and `output_tokens` 10 and then 50, and the call's result message reports `usage.output_tokens` 75
- **THEN** the run records input tokens 6,000, output tokens 75 and 1 turn

#### Scenario: AGENT-024 A subagent's turns count
- **WHEN** a call prints one assistant line with `input_tokens` 1,000 and no `parent_tool_use_id`, and two subagent lines with `parent_tool_use_id` set and `input_tokens` 4,000 and 6,000
- **THEN** the run records input tokens 11,000 and 3 turns

#### Scenario: AGENT-007 A call that fails marks the run failed and the benchmark goes on
- **WHEN** the fake `claude` exits 1 on the second prompt of a run's first of three runs
- **THEN** the runner prints `speckit/feature run 1: prompt 2: claude exited 1 (not saved, will be retried)`, that run is not in the results, and the other two runs still run

#### Scenario: AGENT-016 A call that runs past the timeout fails the run
- **WHEN** the runner runs with `--timeout 1` and the fake `claude` sleeps 5 seconds on the first prompt
- **THEN** that run is recorded as failed with `prompt 1: claude timed out after 1s`

#### Scenario: AGENT-044 Output tokens come from each call's result message
- **WHEN** a run makes two calls, the first printing assistant lines with `output_tokens` 10 and 20 and a result message with `usage.output_tokens` 900, and the second a result message with `usage.output_tokens` 100
- **THEN** the run records output tokens 1,000

### Requirement: A run passes only if the task's golden tests pass
After the last prompt, the runner SHALL copy every file under `fixture/golden/<task>/test/` into
the workspace, overwriting the agent's copies, and run the fixture's test command. The run passes
only if it exits 0; otherwise it is recorded as failed with `acceptance tests failed`.

#### Scenario: AGENT-008 Code that fails the golden tests fails the run
- **WHEN** the fake `claude` leaves `src/invoice.ts` unchanged on the bugfix task, so the golden bulk-discount test fails
- **THEN** the run is recorded as failed with `acceptance tests failed` and its tokens are not part of the cell's median

### Requirement: Results report each cell's median over passing runs
The runner SHALL do a configurable number of runs per workflow and task (default 3, set with
`--runs <n>`). Each cell reports its pass rate, and the median, minimum and maximum input tokens
over passing runs; the median of an even count is the lower middle value. A workflow's total is the
sum of its task medians. `results/agent/results.md` SHALL show a row per cell and a total per
workflow, and the headline `specjutsu saves N% vs speckit, M% vs openspec` on total input tokens,
rounded down. A workflow with a cell that has no passing run gets no total, and the headline names
that cell instead of a saving; when specjutsu itself has no total, the headline is only its first
such cell. `results/agent/results.json` SHALL hold every run's usage, outcome
and reason, the model, and the pins. Full transcripts SHALL NOT be committed: each call's stream-json
is saved under `.bench/transcripts/<workflow>/<task>/run-<n>/prompt-<k>.jsonl`, outside `results/`,
for CI to keep as an artifact.

#### Scenario: AGENT-009 A cell shows the median and range of passing runs
- **WHEN** a cell's three runs pass with input tokens 10,000, 12,000 and 30,000
- **THEN** `results/agent/results.md` shows that cell as pass rate 3/3, median 12,000, range 10,000–30,000

#### Scenario: AGENT-010 Failed runs are left out of the median
- **WHEN** a cell's runs record 9,000 (failed), 14,000 (passed) and 11,000 (passed)
- **THEN** the cell shows pass rate 2/3 and median 11,000

#### Scenario: AGENT-011 The headline compares total input tokens
- **WHEN** the task medians sum to 40,000 for specjutsu, 100,000 for speckit and 80,000 for openspec
- **THEN** `results/agent/results.md` shows `specjutsu saves 60% vs speckit, 50% vs openspec`

#### Scenario: AGENT-012 A workflow with no passing run in a cell gets no total
- **WHEN** every run of `speckit/feature` fails
- **THEN** speckit's total is shown as `—`, and the headline reads `speckit/feature: no passing run` in place of the speckit saving

#### Scenario: AGENT-013 Transcripts are kept outside results
- **WHEN** the second run of `openspec/change` makes three calls
- **THEN** their stream-json is saved as `.bench/transcripts/openspec/change/run-2/prompt-1.jsonl` to `prompt-3.jsonl`, and nothing under `results/` holds a transcript

#### Scenario: AGENT-018 specjutsu with no passing run in a cell gets no headline saving
- **WHEN** every run of `specjutsu/feature` fails and every other cell has a passing run
- **THEN** the headline reads `specjutsu/feature: no passing run`, once

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

### Requirement: Runs are unattended, the same way for every workflow
No one answers an agent's questions in a run. Every `claude` call SHALL pass
`--disallowedTools AskUserQuestion` and `--append-system-prompt` with the line `No one can answer
questions in this run. Where you would ask the user, choose the option you would recommend, say
which you chose, and continue.`, for every workflow alike. These fixed arguments SHALL be part of
every run's fingerprint, so changing them does every saved run again.

#### Scenario: AGENT-045 Every call is told no one can answer
- **WHEN** the runner makes any `claude` call
- **THEN** its arguments include `--disallowedTools AskUserQuestion` and `--append-system-prompt` followed by that line, for specjutsu, speckit and openspec alike

#### Scenario: AGENT-046 The fixed claude arguments are part of the fingerprint
- **WHEN** the fingerprint of `speckit/feature` is taken with the runner's fixed `claude` arguments and again with one of them changed
- **THEN** the two fingerprints differ
