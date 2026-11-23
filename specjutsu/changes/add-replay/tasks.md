# Tasks

## 1. Inputs

- [x] 1.1 Pins: load `pins.json` and refuse inexact versions (STEP-003)
- [x] 1.2 Step scripts: parse, refuse missing sources and missing scripts (STEP-001, STEP-004)
- [x] 1.3 Loaded-file check against the pinned install in `.bench/tools/<tool>@<pin>/` (STEP-002, STEP-005..007)

## 2. Replay

- [x] 2.1 Run a script in a fresh workspace and count bytes per step (REPLAY-001, REPLAY-002)
- [x] 2.2 Session-start files counted per declared session (REPLAY-003, REPLAY-011, STEP-008)
- [x] 2.3 Fixture start and golden end states pass their tests (REPLAY-009)

## 3. Results

- [ ] 3.1 `results.json` and `results.md` with totals and the saving, byte-identical across runs (REPLAY-004, REPLAY-005)
- [ ] 3.2 `--check` drift report (REPLAY-006..008)
- [ ] 3.3 Cross-check against `sj gain --json` (REPLAY-010)

## 4. Content

- [ ] 4.1 Fixture app, the three tasks and their golden end states (no-scenario: fixture data, checked by REPLAY-009)
- [ ] 4.2 Step scripts for specjutsu, Spec Kit + Superpowers and OpenSpec + Superpowers, each step citing its source (no-scenario: benchmark data, checked by STEP-001..008)
- [ ] 4.3 Tool install script for `.bench/tools/`, first committed results, and the CI job running `npm run replay -- --check` (no-scenario: config)
- [ ] 4.4 README: running the replay and reading the results (no-scenario: docs)
