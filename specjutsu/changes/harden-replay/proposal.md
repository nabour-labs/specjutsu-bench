## Why

The replay is meant to be challenged: other tools' maintainers will send pull requests that change step scripts. Today a few mistakes in a script get through the preflight check or crash the replay. A source can be any text, can cite a version other than the pinned one, or can name a file or line range that doesn't exist. A `read` or `write` path can leave the workspace. A missing golden file or a read of a missing file throws a raw Node error. Run steps also inherit the machine's locale, which the design lists as a risk.

## What Changes

- Preflight checks every `<tool>@<pin>:<path>` source: its form, that the pin matches `pins.json`, that the file exists in the pinned install, and that any `#L` line range lies within the file.
- Preflight refuses a `read` or `write` path outside the workspace, and a `write` step whose golden file is missing.
- A `read` step whose file is missing when it runs stops the replay with a named error instead of a crash.
- Run steps get `LANG` and `LC_ALL` set to `C.UTF-8` instead of the machine's values.

## Capabilities

### New Capabilities

### Modified Capabilities

- `steps`: stricter source checks, and a new requirement that read and write steps stay inside the workspace.
- `replay`: a named error for a read of a missing file, and a fixed locale for run steps.

## Impact

`src/steps.ts`, `src/cli.ts` (preflight), `src/replay.ts`, `src/fixture.ts` (`allowlistedEnv`), tests under `test/`. The committed results are expected to stay the same; task 3.2 regenerates and checks them.
