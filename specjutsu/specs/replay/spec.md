# replay Specification

## Purpose
Layer 1 of the benchmark: replay each tool's step scripts against the fixture in fresh workspaces, count the bytes every step puts into the agent's context, and report deterministic results that CI checks for drift.

## Requirements

### Requirement: The replay counts the bytes each step puts into context
The replay SHALL run each step script in a fresh copy of the fixture's start state and record,
for every step, the bytes that step puts into the agent's context: the size of the file for a
`load` or `read` step, and the combined stdout and stderr bytes for a `run` step. A `write` step
places a golden file from `fixture/golden/<task>/` into the workspace and SHALL be recorded as
output bytes, not context bytes; a later step that reads that file counts it as context. Golden
files carry the same content for every tool wherever the tools' formats allow.

#### Scenario: REPLAY-001 Bytes per step
- **WHEN** a script loads a 1,200-byte skill file, reads an 800-byte source file and runs a command that prints 3,000 bytes
- **THEN** `results/results.json` records context 1,200, 800 and 3,000 for those three steps and a script total of 5,000

#### Scenario: REPLAY-002 A written file counts as output, and reading it later counts as context
- **WHEN** a `write` step places a 2,000-byte golden `plan.md` and a later step reads `plan.md`
- **THEN** the `write` step records output 2,000 and context 0, and the `read` step records context 2,000

#### Scenario: REPLAY-013 A run step uses the bench's installed packages
- **WHEN** a `run` step's command is `npx --no-install vitest --version`
- **THEN** it records the same context bytes as that command prints in the bench root, because the workspace links the bench's `node_modules`

#### Scenario: REPLAY-015 The start state is committed on main
- **WHEN** a `run` step's command is `git log --format=%H%n%s main`
- **THEN** it prints one commit with subject `fixture start`, and the hash is the same on every run and machine

### Requirement: Session-start files are counted at every session
Files a tool loads at the start of every agent session (a bootstrap skill, an always-on rules file,
the generated instruction block), listed in `steps/<workflow>/session.yaml`, SHALL be counted at the start of each session its step script
declares. A script starts a new session only where that tool's own docs recommend a fresh session
or clearing context, and the `session` step cites that doc like any other step. A script that
declares no session runs as one session for the task.

#### Scenario: REPLAY-003 Bootstrap counted per session
- **WHEN** a tool's bootstrap file is 4,000 bytes and its script for a task declares 2 sessions
- **THEN** the results record 8,000 context bytes of bootstrap for that task, as two steps

#### Scenario: REPLAY-011 A script with no session step runs as one session
- **WHEN** a tool's bootstrap file is 4,000 bytes and its script for a task has no `session` step
- **THEN** the results record one `session` step of 4,000 context bytes before the script's own steps

### Requirement: The results report totals and the saving
The replay SHALL write `results/results.json` with the pins it ran with and the bytes for every
tool, task and step, and `results/results.md` with one row per tool per task, a total per tool,
and specjutsu's saving against each other tool as a whole percent of context bytes, rounded down.

#### Scenario: REPLAY-004 Totals and saving
- **WHEN** the context totals are specjutsu 10,000, speckit 40,000 and openspec 25,000 bytes
- **THEN** `results/results.md` shows the per-task rows, the three totals, and `specjutsu saves 75% vs speckit, 60% vs openspec`

### Requirement: The replay is deterministic
Two runs on the same commit with the same pins SHALL write byte-identical results files. The
results MUST NOT contain timestamps, absolute paths, durations or machine names. Before a `run`
step's output is counted, the replay SHALL replace every duration (a number followed by `ms` or
`s`, such as `698ms` or `6.92s`) with `0ms` and every clock time (`HH:MM:SS`) with `00:00:00`, so
the count does not depend on how long the command took or when it ran. It SHALL also replace the
workspace's absolute path with `/workspace`, so the count does not depend on the machine's temp
directory. A `run` step SHALL run with no user or system git configuration (`GIT_CONFIG_GLOBAL`
pointing at an empty file and `GIT_CONFIG_NOSYSTEM=1`) and with `COLUMNS=80`, so a command's
output does not depend on the machine's git settings or terminal width. A `run` step SHALL see only
an allowlisted environment (`PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL` and the variables the replay
sets, including `npm_config_update_notifier=false` so npm prints no update notice), so CI detection
such as `CI` or `GITHUB_ACTIONS` can't change what a command prints, and its output SHALL be
counted in full, whatever its size.

#### Scenario: REPLAY-005 Two runs, identical results
- **WHEN** the user runs `npm run replay` twice on the same commit and pins
- **THEN** both runs write byte-identical `results/results.json` and `results/results.md`

#### Scenario: REPLAY-012 A run step's timings don't change its count
- **WHEN** a `run` step's command prints `Start at 14:02:11` and `Duration 6.92s` on one run and `Start at 09:15:40` and `Duration 12.3s` on the next
- **THEN** both runs record the same context bytes for that step, counted as if it printed `Start at 00:00:00` and `Duration 0ms`

#### Scenario: REPLAY-014 A run step's workspace path doesn't change its count
- **WHEN** a `run` step's command prints the absolute path of its own workspace followed by `/test/terms.test.ts`
- **THEN** the step records the bytes of `/workspace/test/terms.test.ts`

#### Scenario: REPLAY-016 A user's git config doesn't change a run step's count
- **WHEN** the user's global git config sets `diff.noprefix = true` and a `run` step runs `git diff` on a changed file
- **THEN** the step records the same context bytes as when there is no global git config

#### Scenario: REPLAY-017 CI variables don't change a run step's count
- **WHEN** the replay runs with `GITHUB_ACTIONS=true` and `CI=true` set and a `run` step prints whether `GITHUB_ACTIONS` is set
- **THEN** the step records the same context bytes as when neither is set

#### Scenario: REPLAY-018 Large run output is counted in full
- **WHEN** a `run` step's command prints 2,000,000 bytes
- **THEN** the step records context 2,000,000

### Requirement: CI fails when results drift from the committed ones
`npm run replay -- --check` SHALL run the replay without writing `results/`, compare its results
with the committed ones, and exit 1 when they differ, printing any changed pin first, then the
first differing tool, task and step with its old and new bytes. It exits 0 when they match.

#### Scenario: REPLAY-006 Byte drift fails the check
- **WHEN** a fresh run records 3,100 bytes for `speckit/feature` step 6 and the committed results say 3,000
- **THEN** `--check` prints `speckit/feature step 6: context 3000 → 3100` and exits 1

#### Scenario: REPLAY-007 A pin change is named first
- **WHEN** `pins.json` moves `speckit` from `0.0.79` to `0.0.80` and the committed results were made with `0.0.79`
- **THEN** `--check` prints `pin speckit 0.0.79 → 0.0.80` before any byte differences and exits 1

#### Scenario: REPLAY-008 Matching results pass
- **WHEN** the committed results match a fresh run
- **THEN** `--check` prints `results match` and exits 0

### Requirement: Fixture states pass their own tests
Before replaying a task, the replay SHALL run the fixture's Vitest suite at the start state and at
that task's golden end state, and MUST exit 1 naming the task and state when a suite that should
pass fails, so a step script never measures a workflow that ends in broken code.

#### Scenario: REPLAY-009 A broken golden end state is refused
- **WHEN** the golden end state of `bugfix` has a failing test
- **THEN** the replay prints `fixture bugfix end state: tests fail` and exits 1 without replaying any script

### Requirement: specjutsu's bytes agree with sj gain
After the specjutsu scripts run, the replay SHALL compare the bytes it counted for each `sj test`,
`sj verify`, `sj next` and `sj status` step with the `printed` totals `sj gain --json` reports for
the same runs, and exit 1 naming the command when they differ.

#### Scenario: REPLAY-010 A mismatch with sj gain fails
- **WHEN** the replay counted 900 bytes across `sj next` steps and `sj gain --json` reports `next` printed 950
- **THEN** it prints `sj gain mismatch for next: replay 900, sj gain 950` and exits 1
