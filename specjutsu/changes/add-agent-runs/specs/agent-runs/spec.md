## ADDED Requirements

### Requirement: Each run drives Claude Code through the workflow's prompt script
For every workflow and task, the runner SHALL copy `fixture/start/` into a fresh workspace, run
the workflow's `agents/<workflow>/setup.yaml` commands there, and then send each prompt in
`agents/<workflow>/<task>.yaml` to `claude -p --output-format stream-json` in order, with the
model the runner is pinned to. A prompt continues the current session (`--resume <session id>`)
unless a `session` entry precedes it, which starts a new one. Claude Code SHALL run with its own
empty configuration directory, so the machine's user settings, memory and plugins never enter the
run. [NEEDS CLARIFICATION: which model is pinned, and is it a full model ID such as `claude-sonnet-5-5`?]

#### Scenario: AGENT-001 Prompts run in order, and a session entry starts a new session
- **WHEN** `agents/speckit/feature.yaml` holds prompt A, prompt B, a `session` entry and prompt C, and the fake `claude` answers each call with a new session id
- **THEN** `claude` is called three times in order: A with no `--resume`, B with `--resume` and A's session id, and C with no `--resume`

#### Scenario: AGENT-002 The machine's Claude Code configuration doesn't reach a run
- **WHEN** the runner starts with `CLAUDE_CONFIG_DIR` pointing at a directory that holds a `CLAUDE.md`, and the fake `claude` prints the `CLAUDE_CONFIG_DIR` it sees
- **THEN** that directory is a fresh, empty one inside the run's temporary area, not the machine's

#### Scenario: AGENT-003 A failing setup command stops the benchmark
- **WHEN** the first command in `agents/speckit/setup.yaml` exits 1
- **THEN** the runner prints `speckit setup step 1: exited 1`, exits 1 and writes no results

### Requirement: Prompt and setup scripts cite their sources
Every prompt and every setup command SHALL carry a `source`, checked before any run with the
same rules as a step script's sources (form, pinned tool, pin, file and line range). Every
workflow MUST have a setup script and one prompt script per task in `fixture/tasks.json`. A failed
check exits 1, names the script and the entry, and writes no results.

#### Scenario: AGENT-004 A prompt citing another version is refused
- **WHEN** `pins.json` pins `speckit` to `1.4.3` and the second prompt in `agents/speckit/feature.yaml` cites `speckit@1.4.2:templates/commands/plan.md`
- **THEN** the runner prints `agents/speckit/feature.yaml prompt 2: source cites speckit@1.4.2, but speckit is pinned to 1.4.3` and exits 1

#### Scenario: AGENT-005 A missing prompt script is refused
- **WHEN** `fixture/tasks.json` lists `feature`, `bugfix` and `change` and `agents/openspec/bugfix.yaml` does not exist
- **THEN** the runner prints `missing agents/openspec/bugfix.yaml` and exits 1

### Requirement: A run's usage is summed from every turn
The runner SHALL read the usage of every assistant turn in the stream-json output of every call in
a run. A run's input tokens are the sum of `input_tokens`, `cache_creation_input_tokens` and
`cache_read_input_tokens`; its output tokens the sum of `output_tokens`; its cost the sum of
each call's reported `total_cost_usd`. A call that exits non-zero or prints no result message marks
the run failed with that reason, and the runner goes on to the next run.

#### Scenario: AGENT-006 Input tokens include cache writes and reads
- **WHEN** a run's turns report `input_tokens` 1,000 and 400, `cache_creation_input_tokens` 200 and 0, `cache_read_input_tokens` 5,000 and 6,000, and `output_tokens` 300 and 100
- **THEN** the run records input tokens 12,600 and output tokens 400

#### Scenario: AGENT-007 A call that fails marks the run failed and the benchmark goes on
- **WHEN** the fake `claude` exits 1 on the second prompt of a run's first of three runs
- **THEN** that run is recorded as failed with `prompt 2: claude exited 1`, and the other two runs still run

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
that cell instead of a saving. `results/agent/results.json` SHALL hold every run's usage, outcome
and reason, the model, and the pins. [NEEDS CLARIFICATION: are full transcripts committed beside the results, or only the per-run usage summaries?]

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
