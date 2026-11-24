## MODIFIED Requirements

### Requirement: The replay counts the bytes each step puts into context
The replay SHALL run each step script in a fresh copy of the fixture's start state and record,
for every step, the bytes that step puts into the agent's context: the size of the file for a
`load` or `read` step, and the combined stdout and stderr bytes for a `run` step. A `write` step
places a golden file from `fixture/golden/<task>/` into the workspace and SHALL be recorded as
output bytes, not context bytes; a later step that reads that file counts it as context. Golden
files carry the same content for every tool wherever the tools' formats allow. A `read` step whose
file does not exist when the step runs SHALL stop the replay with
`<tool>/<task> step <n>: read failed: <path> not found`, exit 1, and write no results.

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

#### Scenario: REPLAY-020 A read of a missing file stops the replay
- **WHEN** the third step of `steps/speckit/feature.yaml` reads `notes.md` and no earlier step or the start state created it
- **THEN** the replay prints `speckit/feature step 3: read failed: notes.md not found`, exits 1 and leaves `results/` unchanged

### Requirement: The replay is deterministic
Two runs on the same commit with the same pins SHALL write byte-identical results files. The
results MUST NOT contain timestamps, absolute paths, durations or machine names. Before a `run`
step's output is counted, the replay SHALL replace every duration (a number followed by `ms` or
`s`, such as `698ms` or `6.92s`) with `0ms` and every clock time (`HH:MM:SS`) with `00:00:00`, so
the count does not depend on how long the command took or when it ran. It SHALL also replace the
workspace's absolute path with `/workspace`, so the count does not depend on the machine's temp
directory. It SHALL replace the bench checkout's absolute path, and the path from the workspace to
it (`../../home/runner/work/x/x`, as a tool prints a file in the linked `node_modules`), with
`/bench`, so the count does not depend on where the bench repository is checked out. A `run` step SHALL run with no user or system git configuration (`GIT_CONFIG_GLOBAL`
pointing at an empty file and `GIT_CONFIG_NOSYSTEM=1`) and with `COLUMNS=80`, so a command's
output does not depend on the machine's git settings or terminal width. A `run` step SHALL see only
an allowlisted environment (`PATH`, `HOME`, `TMPDIR` and the variables the replay sets, including `npm_config_update_notifier=false` so npm prints no update notice, and `LANG` and
`LC_ALL` set to `C.UTF-8` so no command prints translated messages), so CI detection
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

#### Scenario: REPLAY-019 A run step's bench checkout path doesn't change its count
- **WHEN** a `run` step's command prints the path from its workspace to the bench's `node_modules/vite/dist/node/chunks/config.js`, as Node's `path.relative` gives it
- **THEN** the step records the bytes of `/bench/node_modules/vite/dist/node/chunks/config.js`

#### Scenario: REPLAY-021 The machine's locale doesn't change a run step's count
- **WHEN** the replay runs with `LANG=de_DE.UTF-8` and `LC_ALL=de_DE.UTF-8` set and a `run` step prints `$LANG $LC_ALL`
- **THEN** the step records the bytes of `C.UTF-8 C.UTF-8` and a newline

