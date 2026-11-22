## Context

The benchmark has two layers. This change builds layer 1, a deterministic replay that runs on
every pull request. Layer 2, real agent runs counted from transcripts, is a later change and is
the check on how much layer 1's choices favour specjutsu. The repo is public from the start so
the other tools' maintainers can challenge a step script while it is cheap to fix.

## Goals / Non-Goals

**Goals:**

- The same three tasks, on the same app, for every tool.
- Every byte counted comes from running the pinned tool or reading a pinned file, never from a
  number typed into a script.
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
- **Step scripts are YAML with four step kinds: `load`, `read`, `run`, `write`.** `load` reads a
  file from a pinned tool install (a skill, a slash-command template), `read` a file in the
  workspace, `run` a command in the workspace, `write` a golden file into it. Rejected: scripts in
  code, which are harder for an outside reviewer to read and challenge.
- **Agent-written content is golden files.** The replay can't generate what an agent writes, so a
  task's specs, plans and code are fixed files under `fixture/golden/<task>/`. Where the tools'
  formats differ (a Spec Kit `spec.md` against an OpenSpec delta), each tool gets its own file
  carrying the same requirements.
- **Sessions follow each tool's docs.** A script starts a new session (and pays the session-start
  files again) only where the tool's docs say to start fresh or clear context, citing that doc;
  otherwise a task is one session. Rejected: one session per phase for every tool, which charges
  bootstrap costs to tools that don't ask for a fresh start, and one per task for every tool,
  which ignores tools that do.
- **Pins allow an exact version or a full commit.** `sj` with `sj gain` is on specjutsu's main
  branch but not yet in a release, and Superpowers is consumed from git, so a commit pin is needed.
  Rejected: npm-style ranges, which would let results drift without a change in this repo.
- **Tools install into `.bench/tools/<tool>@<pin>/`, outside `results/`.** CI caches it by
  `pins.json` hash. The install path never appears in the results.
- **Results store bytes, not tokens.** `results.md` shows tokens as bytes / 4 next to the bytes,
  computed when written. The saving percent is computed on context bytes only; output bytes are
  shown but not part of the headline, because every tool ends at the same golden output.

## Risks / Trade-offs

- [The scripts are written by specjutsu's authors] → Every step cites its source, the repo is
  public, and layer 2 checks the replay against real agent runs.
- [A rival workflow has steps its docs leave to the agent's judgement] → The script takes the
  smallest reading the docs allow and says so in the step's `note`; choosing the smallest favours
  the rival, not specjutsu.
- [Installing three tools makes CI slow] → Cache `.bench/tools/` by `pins.json` hash.
- [Golden files make output identical across tools] → That's the intent for layer 1: it measures
  the context each workflow costs to reach the same result.
