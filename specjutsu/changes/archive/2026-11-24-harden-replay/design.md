## Context

Preflight (`src/cli.ts`, `check`) already refuses a step with no source, bad `load` steps and `sj` runs without the pinned binary. The new checks join it, so a bad script still fails before anything runs and writes no results.

## Goals / Non-Goals

**Goals:** every check a reviewer would do by hand on a step's citation and paths runs in preflight, with a message naming the script and step.

**Non-Goals:** checking that a cited doc actually prescribes the step (that's the reviewer's job), checking `https://` URLs (no network in preflight), or checking statically that a `read` target exists, since `run` steps (`sj spec new`, say) create files.

## Decisions

- **Sources are parsed with one pattern, `<tool>@<pin>:<path>[#L<a>[-L<b>]]` or `https://…`.** The path check reuses the `load` step's rule (inside `.bench/tools/<tool>@<pin>/`, a file). The line range is checked against the file's line count. Rejected: allowing any text in `source`, which makes a typo or a stale citation look valid.
- **A source's pin must equal the pinned version.** After a pin bump, every citation must be re-checked against the new version, and this makes preflight list them. Rejected: rewriting citations automatically on a bump, which would claim a doc still says what it said in the old version.
- **A read of a missing file is a runtime error, not a preflight one.** It's raised like `RunStepError`, as `<tool>/<task> step <n>: read failed: <path> not found`.
- **Run steps use `LANG=C.UTF-8` and `LC_ALL=C.UTF-8`.** This takes the locale risk out of the design. Where a system lacks `C.UTF-8`, programs fall back to the C locale, which still prints untranslated messages. Rejected: `C`, which makes some tools replace non-ASCII output.

## Risks / Trade-offs

- [A pin bump now fails preflight until every citation is updated] → That's intended: a citation must name the version it was checked against.
