## Why

Layer 1 counts the bytes of scripted steps that specjutsu's authors wrote. Its design names real agent runs (layer 2) as the check on how much those choices favour specjutsu, and the headline rests on the replay alone until that check exists. Layer 2 runs Claude Code itself through each workflow on the same three tasks and counts the tokens the model actually processed, including everything each tool's real installer adds.

This change builds the layer 2 runner and its results. Running it on a schedule in CI, with an API key and a budget, is the next change (`add-agent-ci`).

## What Changes

- A runner, `npm run agents`, that sets each workflow up with its own installer in a fresh copy of `fixture/start/`, then drives Claude Code headless (`claude -p`) through that workflow's committed prompt script for each task.
- Prompt scripts, `agents/<workflow>/<task>.yaml`, and setup scripts, `agents/<workflow>/setup.yaml`. Every prompt and setup command cites its source, checked with the same rules as the step scripts.
- Usage parsed from Claude Code's stream-json output. Per run: total input tokens (uncached, cache-write and cache-read), output tokens, turns and reported cost.
- An acceptance check. After a run, the task's golden tests are copied in, and the run passes only if the fixture's suite passes.
- Several runs per cell (default 3). Each cell reports the median and min–max over passing runs, plus a pass rate.
- `results/agent/results.json` and `results/agent/results.md`, with the headline `specjutsu saves N% vs speckit, M% vs openspec` on total input tokens.

## Capabilities

### New Capabilities

- `agent-runs`: layer 2, real agent runs and their results.

### Modified Capabilities

## Impact

- New `src/agents/` (runner, usage parsing, results), `agents/` (setup and prompt scripts), `test/agents*.test.ts` with a fake `claude`.
- `package.json` gets an `agents` script.
- It reuses `src/steps.ts`'s citation and pin checks and `src/fixture.ts`'s environment and suite check.
- Running it needs the `claude` CLI, network access for the installers, and an Anthropic API key. Tests need none of these.
