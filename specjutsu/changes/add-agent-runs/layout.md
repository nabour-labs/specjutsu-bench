# Layout (controller notes for implementers)

Not a spec artifact: the shapes every task builds on, so tasks fit together.

## Files

- `agents/agents.json`: `{ "model": "claude-sonnet-5-5" }`.
- `agents/<workflow>/setup.yaml`:
  ```yaml
  steps:
    - command: uvx --from git+https://github.com/github/spec-kit.git@v1.4.3 specify init --here --ai claude
      source: speckit@1.4.3:README.md#L40-L52
      note: optional
  ```
- `agents/<workflow>/<task>.yaml`:
  ```yaml
  prompts:
    - prompt: "/speckit.specify Add payment terms ..."
      source: speckit@1.4.3:templates/commands/specify.md
    - session: true
      source: speckit@1.4.3:docs/quickstart.md#L10-L12
    - prompt: "/speckit.plan"
      source: speckit@1.4.3:templates/commands/plan.md
  ```
  Entries are numbered per kind in messages: the second `prompt` entry is `prompt 2`, a
  `session` entry is `session <n>`. Setup commands are `setup step <n>`.

## Code

- `src/agents/scripts.ts`: types, loaders and preflight checks for the files above. Reuses the
  citation checks in `src/steps.ts` (`checkCitations`-style logic on each entry's `source`).
- `src/agents/run.ts`: one run of one workflow and task (workspace, setup, calls, acceptance).
- `src/agents/usage.ts`: stream-json parsing and usage sums.
- `src/agents/results.ts`: cells, medians, totals, headline, results.md.
- `src/agents/cli.ts`: `npm run agents [--runs <n>]` → `node src/agents/cli.ts`. Preflight, then
  every run, then `results/agent/results.json` and `results/agent/results.md`.
- `claude` is found on PATH. Tests put a fake `claude` (a small Node script) first on PATH.

## Tests

- `test/agents.test.ts`, with helpers in `test/agent-helpers.ts`: a throwaway root built on
  `benchRoot` from `test/helpers.ts`, plus `agents/` files and a fake `claude` whose canned
  stream-json and recorded argv/env are controlled per test through files in the root.
