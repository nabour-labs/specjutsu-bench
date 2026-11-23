## ADDED Requirements

### Requirement: Every step cites a source that exists in the pinned version
Each step in a step script SHALL carry a `source` naming the tool doc, template or file the step
comes from, as `<tool>@<pin>:<path>` or an `https://` URL. Before running anything the replay
MUST check every step, and for a `load` step it MUST check that the step names a `tool` and a
`path`, that the tool is pinned, that the path stays inside that tool's pinned install
(`.bench/tools/<tool>@<pin>/`), and that the loaded file exists there as a file. A failed check exits 1, names the script and step, and writes no
results.

#### Scenario: STEP-001 A step without a source is refused
- **WHEN** `steps/speckit/feature.yaml` has a fourth step with no `source` and the user runs `npm run replay`
- **THEN** it prints `steps/speckit/feature.yaml step 4: missing source`, exits 1 and leaves `results/` unchanged

#### Scenario: STEP-002 A loaded file missing from the pinned version is refused
- **WHEN** a `load` step names `skills/test-driven-development/SKILL.md` and that file is not in the pinned Superpowers checkout
- **THEN** the replay prints the script, the step number and `skills/test-driven-development/SKILL.md not found in superpowers@<pin>`, and exits 1

#### Scenario: STEP-005 A load path outside the pinned install is refused
- **WHEN** a `load` step for `superpowers` names the path `../../package.json`
- **THEN** the replay prints the script, the step number and `../../package.json is outside superpowers@<pin>`, and exits 1

#### Scenario: STEP-006 A load from an unpinned tool is refused
- **WHEN** a `load` step names the tool `kiro` and `pins.json` has no `kiro` entry
- **THEN** the replay prints the script, the step number and `tool kiro is not pinned`, and exits 1

#### Scenario: STEP-007 A load step without a tool or path is refused
- **WHEN** the third step of `steps/openspec/change.yaml` is a `load` step with a `path` but no `tool`
- **THEN** the replay prints `steps/openspec/change.yaml step 3: load step missing tool` and exits 1

### Requirement: Session-start lists hold only load steps
A workflow's `steps/<workflow>/session.yaml` SHALL contain only `load` steps, and the replay MUST
refuse any other kind of step there, naming the file and the step.

#### Scenario: STEP-008 A non-load step in a session-start list is refused
- **WHEN** the second step of `steps/speckit/session.yaml` is a `read` step
- **THEN** the replay prints `steps/speckit/session.yaml step 2: only load steps are allowed in session.yaml` and exits 1

### Requirement: Tools are pinned to exact versions
`pins.json` SHALL give every tool an exact version: a full semantic version such as `1.4.0`, or a
full 40-character git commit. The replay MUST refuse a range, a tag-like alias or a branch name.

#### Scenario: STEP-003 A version range is refused
- **WHEN** `pins.json` pins `openspec` to `^1.2` and the user runs `npm run replay`
- **THEN** it prints `pin openspec: "^1.2" is not an exact version` and exits 1

### Requirement: Every tool has a script for every task
The replay SHALL require one step script per tool per task listed in `fixture/tasks.json`, and
MUST refuse to run when one is missing.

#### Scenario: STEP-004 A missing script is refused
- **WHEN** `fixture/tasks.json` lists `feature`, `bugfix` and `change` and `steps/openspec/bugfix.yaml` does not exist
- **THEN** the replay prints `missing steps/openspec/bugfix.yaml` and exits 1
