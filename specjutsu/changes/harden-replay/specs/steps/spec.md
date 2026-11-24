## ADDED Requirements

### Requirement: Read and write steps stay inside the workspace
A `read` or `write` step's `path` SHALL stay inside the workspace. A
`write` step's golden file, `fixture/golden/<task>/<path>`, MUST exist as a file. The replay
checks this before running anything; a failed check exits 1, names the script and step, and
writes no results.

#### Scenario: STEP-013 A read path outside the workspace is refused
- **WHEN** the fifth step of `steps/speckit/bugfix.yaml` is a `read` step with path `../../pins.json`
- **THEN** the replay prints `steps/speckit/bugfix.yaml step 5: ../../pins.json is outside the workspace` and exits 1

#### Scenario: STEP-014 A write step whose golden file is missing is refused
- **WHEN** the seventh step of `steps/speckit/feature.yaml` writes `src/terms.ts` and `fixture/golden/feature/src/terms.ts` does not exist
- **THEN** the replay prints `steps/speckit/feature.yaml step 7: src/terms.ts not found in fixture/golden/feature` and exits 1

#### Scenario: STEP-015 A write path outside the workspace is refused
- **WHEN** a `write` step in `steps/openspec/change.yaml` has path `../escape.md`
- **THEN** the replay prints the script, the step number and `../escape.md is outside the workspace`, and exits 1

## MODIFIED Requirements

### Requirement: Every step cites a source that exists in the pinned version
Each step in a step script SHALL carry a `source` naming the tool doc, template or file the step
comes from, as `<tool>@<pin>:<path>` (optionally ending `#L<a>` or `#L<a>-L<b>`) or an `https://` URL.
Before running anything the replay MUST check every step. A `<tool>@<pin>:<path>` source MUST
name a pinned tool at the version `pins.json` gives it, and a path that stays inside that tool's
pinned install and is a file there; a line range MUST start at line 1 or later, MUST NOT end before it starts, and MUST lie
within that file's lines. A source naming a tool that isn't pinned, or a path outside the tool's
install, is refused with a message starting `source`. For a `load` step it MUST also check that the step names a `tool` and a
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

#### Scenario: STEP-009 A source in neither form is refused
- **WHEN** the second step of `steps/speckit/feature.yaml` has `source: spec-kit README`
- **THEN** the replay prints `steps/speckit/feature.yaml step 2: source "spec-kit README" is not <tool>@<pin>:<path> or an https:// URL` and exits 1

#### Scenario: STEP-010 A source citing another version is refused
- **WHEN** `pins.json` pins `speckit` to `1.4.3` and a step's source is `speckit@1.4.2:templates/spec-template.md`
- **THEN** the replay prints the script, the step number and `source cites speckit@1.4.2, but speckit is pinned to 1.4.3`, and exits 1

#### Scenario: STEP-011 A source citing a missing file is refused
- **WHEN** a step's source is `speckit@1.4.3:templates/gone.md` and that file is not in the pinned Spec Kit checkout
- **THEN** the replay prints the script, the step number and `source templates/gone.md not found in speckit@1.4.3`, and exits 1

#### Scenario: STEP-012 A source line range past the end of the file is refused
- **WHEN** a step's source is `speckit@1.4.3:templates/spec-template.md#L10-L90` and that file has 80 lines
- **THEN** the replay prints the script, the step number and `source templates/spec-template.md#L10-L90: the file has 80 lines`, and exits 1

#### Scenario: STEP-016 A reversed source line range is refused
- **WHEN** a step's source is `speckit@1.4.3:templates/spec-template.md#L20-L10`
- **THEN** the replay prints the script, the step number and `source templates/spec-template.md#L20-L10: not a valid line range`, and exits 1

#### Scenario: STEP-017 A source line range starting at line 0 is refused
- **WHEN** a step's source is `speckit@1.4.3:templates/spec-template.md#L0`
- **THEN** the replay prints the script, the step number and `source templates/spec-template.md#L0: not a valid line range`, and exits 1

#### Scenario: STEP-018 A source citing an unpinned tool is refused
- **WHEN** a step's source is `kiro@1.0.0:docs/spec.md` and `pins.json` has no `kiro` entry
- **THEN** the replay prints the script, the step number and `source cites kiro, which is not pinned`, and exits 1

#### Scenario: STEP-019 A source path outside the pinned install is refused
- **WHEN** a step's source is `speckit@1.4.3:../../pins.json`
- **THEN** the replay prints the script, the step number and `source ../../pins.json is outside speckit@1.4.3`, and exits 1
