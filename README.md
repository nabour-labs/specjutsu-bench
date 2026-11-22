# specjutsu-bench

A reproducible token benchmark for spec-driven development workflows. It runs the same tasks on
the same small TypeScript app with three setups and counts what each one puts into the agent's
context:

- specjutsu
- Spec Kit + Superpowers
- OpenSpec + Superpowers

Every tool is pinned to an exact version, and every step the benchmark replays cites the doc or
template it comes from, so anyone can rerun it and challenge a step.

Status: in development. No numbers are published yet.

## Layers

1. **Replay (CI).** Scripted steps per tool and task, run against the pinned versions. Counts the
   bytes each step puts into context. Deterministic, runs on every pull request.
2. **Agent runs (periodic).** A real agent does the tasks with each setup, and tokens are counted
   from the transcripts. Planned.

This repo is built with [specjutsu](https://github.com/nabour-labs/specjutsu).
