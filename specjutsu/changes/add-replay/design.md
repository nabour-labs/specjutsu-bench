## Context

The benchmark has two layers. This change builds layer 1, a deterministic replay that runs on
every pull request. Layer 2, real agent runs counted from transcripts, is a later change and is
the check on how much layer 1's choices favour specjutsu. The repo is public from the start so
the other tools' maintainers can challenge a step script while it is cheap to fix.

## Goals / Non-Goals

**Goals:**

- The same three tasks, on the same app, for every tool.
- Every byte counted comes from running a command or reading a pinned file, never from a number
  typed into a script.
- Every step cites where the workflow says to do it.
- Results that change only when a script, the fixture or a pin changes.

**Non-Goals:**

- Calling a model. Layer 1 counts bytes only; tokens are estimated as bytes / 4, as in `sj gain`.
- Real agent runs, time measurements and headline numbers on the specjutsu site.
- Judging which workflow writes better code. All three end at the same golden end state.

## Decisions

- **The harness is TypeScript, run with Node 22.** It sits beside the fixture and uses the same
  toolchain. Rejected: Rust reusing sj's crates, which would tie the benchmark to the tool it
  measures.
- **Step scripts are YAML with four step kinds that touch bytes, `load`, `read`, `run`, `write`, plus `session`, which marks where a new agent session starts.** `load` reads a
  file from a pinned tool install (a skill, a slash-command template), `read` a file in the
  workspace, `run` a command in the workspace, `write` a golden file into it. Rejected: scripts in
  code, which are harder for an outside reviewer to read and challenge.
- **Agent-written content is golden files.** The replay can't generate what an agent writes, so a
  task's specs, plans and code are fixed files under `fixture/golden/<task>/`. Where the tools'
  formats differ (a Spec Kit `spec.md` against an OpenSpec delta), each tool gets its own file
  carrying the same requirements.
- **`fixture/tasks.json` names the fixture's test command in a `test` key**, beside `tasks`. It
  holds the shell command that runs the fixture's own suite (run in a copy of the start state and
  of each task's golden end state, with a timeout) so the replay can refuse a broken fixture before
  replaying any script. It is configurable because the command belongs to the fixture, not the
  harness: a different fixture app brings its own runner. A missing key is reported as
  `fixture/tasks.json: missing test command`, exit 1.
- **Sessions follow each tool's docs.** A script starts a new session (and pays the session-start
  files again) only where the tool's docs say to start fresh or clear context, citing that doc;
  otherwise a task is one session. Rejected: one session per phase for every tool, which charges
  bootstrap costs to tools that don't ask for a fresh start, and one per task for every tool,
  which ignores tools that do.
- **Pins allow an exact version or a full commit.** A version pin installs the tool's tag
  `v<pin>`; a commit pin installs that commit, for a tool whose needed change isn't released yet.
  specjutsu's `sj` binary comes from its release, so specjutsu takes a version pin.
  Rejected: npm-style ranges, which would let results drift without a change in this repo.
- **Tools install into `.bench/tools/<tool>@<pin>/`, outside `results/`.** CI caches it by
  `pins.json` hash. The install path never appears in the results. Each install is the tool's
  own git repository checked out at the pinned tag or commit (github/spec-kit, Fission-AI/OpenSpec,
  obra/superpowers, nabour-labs/specjutsu), so a `load` step's `path` is a path in that
  repository and its `source` is `<tool>@<pin>:<path>`. specjutsu's install also holds the built
  `bin/sj`. Rejected: loading files that each tool's `init` generates, which would need the
  tools' installers and network access during the replay.
- **Results store bytes, not tokens.** `results.md` shows tokens as bytes / 4 next to the bytes,
  computed when written. The saving percent is computed on context bytes only; output bytes are
  shown but not part of the headline, because every tool ends at the same golden output.

- **Run-step output is normalised before it is counted.** Durations (`698ms`, `6.92s`) become
  `0ms` and clock times become `00:00:00`, so a test run that prints its timings counts the same
  bytes every time. Rejected: requiring each `run` step to pass flags that hide timings, which
  would make the scripts differ from what each tool's docs tell the agent to run.

- **`--check` drift lines use the script's step numbers.** `speckit/feature step 6` is step 6
  of `steps/speckit/feature.yaml`, as in every other message. When the replay adds an implicit
  session step to a script that declares none, that step is `step 0`; the replay records each
  script's first step number as `firstStep` in `results.json`, so the rule lives only in the
  replay. A script in only one of the two results is named as `<tool>/<task>: missing` or
  `<tool>/<task>: added`, and a pin on only one side shows `none` for the other. When the results
  differ in nothing the check names (a step's path or command, say), it prints `results differ`,
  exit 1, so a change is never passed silently. A missing `results/results.json` is reported as
  `results/results.json: missing`, and one that is not JSON with `pins` and `workflows` as
  `results/results.json: unreadable`, both exit 1. Rejected: numbering the recorded steps, which
  shifts every step by one in scripts with no session step.

- **`sj` is the pinned `.bench/tools/specjutsu@<pin>/bin/sj`, and the replay cross-checks it with
  `sj gain`.** Run steps get that `bin/` first on PATH. `sj gain` keeps its records per
  workspace (`<repo>/.specjutsu/ledger/gain.jsonl`), so after each specjutsu script that ran an
  `sj test`, `verify`, `next` or `status` step the replay asks `sj gain --json --root <workspace>`
  in that script's own workspace, never the developer's history, and sums `printed` per command
  across the scripts. The replay's side is the raw stdout and stderr bytes of those steps, before
  durations and clock times are normalised, because `sj gain` counts what was printed. A
  difference prints `sj gain mismatch for <command>: replay <n>, sj gain <m>` and exits 1; a plain
  replay then writes no results, and `--check` runs the same check beside the drift report, so CI
  catches it too. Rejected: comparing normalised bytes, which differ from `printed` whenever `sj`
  prints a timing.

- **Every replay workspace is a git repo, and `fixture/start/.specjutsu/ledger` is never copied
  into it.** The replay runs `git init -q` in each fresh workspace, for every tool, so all tools
  see the same workspace: `sj` records gain only inside a git repo, and without one `sj gain`
  would report no runs. Leaving out the start state's ledger keeps stale records from a
  developer's earlier `sj` runs out of the comparison, which must cover only the replay's own
  runs. The pinned binary sits at `.bench/tools/specjutsu@<pin>/bin/sj`; the tool install script
  must put it there.

- **The pinned `sj` is required, never the one on PATH, and `sj` steps are bare, valid
  invocations.** A run step calling `sj` is refused before the replay when specjutsu has no pin
  (`tool specjutsu is not pinned`) or its `bin/sj` is missing (`specjutsu@<pin> is not
  installed: .bench/tools/specjutsu@<pin>/bin/sj`). An `sj` step must be a bare
  `sj <cmd> ...` command (no `cd x &&`, no pipe) that `sj` accepts: only those are matched to
  `sj gain`'s records, and `sj` does not record a usage error (exit 2), so such a step always
  mismatches. When `sj gain --json` exits non-zero or prints no JSON, the replay prints
  `sj gain --json failed for <tool>/<task>: <first stderr line or unreadable>` instead of
  mismatch lines, exit 1, naming the script rather than the temporary workspace.

- **Each workspace commits the start state on `main` before the first step.** `sj verify` needs a
  default branch to diff against, and a real project has history. The commit uses a fixed author,
  committer and date (`bench <bench@localhost>`, 2026-01-01T00:00:00Z), so its hash, and any output
  that shows it, is the same everywhere. Rejected: passing `--base` to `sj`, which an unborn HEAD
  can't satisfy and which no tool's docs tell the agent to do.

- **Only specjutsu's CLI runs; the rivals' CLIs don't.** The replay runs `sj`, the fixture's
  test suite and git. Spec Kit's `specify` and OpenSpec's `openspec` aren't installed, so where a
  rival's docs prescribe one of their commands, the script leaves its output out and says so in
  the step's `note`. That makes the rivals' counts lower bounds. Rejected: installing them through
  `uv` and npm, which adds two toolchains to CI to count bytes that would only raise the rivals'
  totals.
- **Installed-form overhead is not counted for any tool.** A `load` step counts the file as it is in
  the tool's repository, not the copy `init` installs: specjutsu's begin/end markers and generated
  hash lines, and Superpowers' hook wrapper text, are left out alike.

## Risks / Trade-offs

- [Run steps keep the machine's locale] → A git built with gettext prints translated messages under
  a non-English `LANG`. CI's runner uses `C.UTF-8`, and `--check` runs there on every pull request.
- [Normalising durations changes the counted bytes slightly] → The difference is a few bytes per
  timing line and applies the same rule to every tool.

- [The scripts are written by specjutsu's authors] → Every step cites its source, the repo is
  public, and layer 2 checks the replay against real agent runs.
- [A rival workflow has steps its docs leave to the agent's judgement] → The script takes the
  smallest reading the docs allow and says so in the step's `note`; choosing the smallest favours
  the rival, not specjutsu.
- [Installing three tools makes CI slow] → Cache `.bench/tools/` by `pins.json` hash.
- [Golden files make output identical across tools] → That's the intent for layer 1: it measures
  the context each workflow costs to reach the same result.
