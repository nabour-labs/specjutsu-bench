## MODIFIED Requirements

### Requirement: The replay is deterministic
Two runs on the same commit with the same pins SHALL write byte-identical results files. The
results MUST NOT contain timestamps, absolute paths, durations or machine names. Before a `run`
step's output is counted, the replay SHALL replace every duration (a number followed by `ms` or
`s`, such as `698ms` or `6.92s`) with `0ms` and every clock time (`HH:MM:SS`) with `00:00:00`, so
the count does not depend on how long the command took or when it ran. It SHALL also replace the
workspace's absolute path with `/workspace`, so the count does not depend on the machine's temp
directory. It SHALL replace the bench checkout's absolute path, and any path relative to the
workspace that leads into it (`../../home/runner/work/x/node_modules/vite/a.js`), with `/bench`, so
the count does not depend on where the bench repository is checked out. A `run` step SHALL run with no user or system git configuration (`GIT_CONFIG_GLOBAL`
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

#### Scenario: REPLAY-019 A run step's bench checkout path doesn't change its count
- **WHEN** a `run` step's command prints the path from its workspace to the bench's `node_modules/vite/dist/node/chunks/config.js`, as `../` segments followed by the bench checkout's absolute path without its leading `/`
- **THEN** the step records the bytes of `/bench/node_modules/vite/dist/node/chunks/config.js`
