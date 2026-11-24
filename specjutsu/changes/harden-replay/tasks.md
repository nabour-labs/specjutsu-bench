# Tasks

## 1. Sources

- [x] 1.1 Source form and pin check (STEP-009, STEP-010)
- [x] 1.2 Source file and line range check (STEP-011, STEP-012)
- [x] 1.4 Reject invalid ranges, unpinned tools and outside paths in sources (STEP-016..019)
- [x] 1.3 Recheck the existing source and load scenarios (STEP-001, STEP-002, STEP-005..007)

## 2. Paths

- [x] 2.1 Read and write paths stay inside the workspace (STEP-013, STEP-015)
- [x] 2.2 A write step's golden file must exist (STEP-014)
- [x] 2.3 A read of a missing file stops the replay (REPLAY-020)
- [x] 2.4 Recheck the existing byte-count scenarios (REPLAY-001, REPLAY-002, REPLAY-013, REPLAY-015)

## 3. Locale

- [x] 3.1 Run steps use a fixed locale (REPLAY-021)
- [x] 3.2 Recheck determinism and regenerate results (REPLAY-005, REPLAY-012, REPLAY-014, REPLAY-016..019)

## 4. Final review fixes

- [ ] 4.1 A read or write step without a path is refused (STEP-020)
- [ ] 4.2 README: citation checks and the fixed locale (no-scenario: docs)
