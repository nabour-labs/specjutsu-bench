## Context

Layer 1 (specs `replay`, `steps`) replays cited steps against pinned installs and counts bytes. Layer 2 is the check on it: a real agent, real installers, real token counts. The decisions made while exploring it: run in scheduled CI with a repo API key (next change), 3 runs per cell with the median, scripted prompts per workflow, and total input tokens as the headline.

## Goals / Non-Goals

**Goals:**

- The same tasks and fixture as layer 1, run by Claude Code with each workflow installed the way its docs say.
- Every prompt and setup command cites where the workflow says to do it, and is checked like a step.
- Results that show the noise: pass rate, median and range per cell.
- A runner that's fully testable without the network or an API key.

**Non-Goals:**

- Running it in CI, the API key, schedule and budget cap (`add-agent-ci`).
- Agents other than Claude Code.
- Judging code quality beyond the golden acceptance tests.
- Deterministic results. Layer 2 isn't checked for drift on pull requests.

## Decisions

- **Claude Code headless with stream-json.** Each prompt is one `claude -p --output-format stream-json --verbose --model <model> --permission-mode bypassPermissions` call in the workspace, and the stream's assistant messages carry per-turn usage. Rejected: calling the API directly with our own agent loop, which wouldn't load each workflow's commands, skills or plugin the way users get them.
- **Sessions follow the layer 1 scripts.** A prompt resumes the previous call's session unless a `session` entry precedes it, the same places layer 1 starts a new session, each citing the doc that says to start fresh. Rejected: one session per task for every tool.
- **Real installers, cited in `agents/<workflow>/setup.yaml`.** Setup commands run in the workspace before the first prompt, and their own output isn't counted. What they install is what Claude Code then loads, so installer overhead (markers, hook text, generated commands) counts for every tool alike. That's the counterpart to layer 1's "installed-form overhead is not counted". Rejected: reusing layer 1's `.bench/tools` checkouts, which would hide exactly what layer 2 should measure.
- **An isolated Claude Code configuration.** `CLAUDE_CONFIG_DIR` points at a fresh directory per run, so the machine's `CLAUDE.md`, memory, settings and plugins never enter a run. Setup commands that install a plugin install it there.
- **Golden tests as the acceptance check.** The agent writes its own tests, but a run passes only when `fixture/golden/<task>/test/` passes against its code. Rejected: the agent's own tests, which a weak run could write to pass.
- **Median over passing runs, lower middle for even counts.** It keeps integers and doesn't let one runaway run move a cell. Failed runs are shown in the pass rate and recorded in results.json with their reason.
- **`claude-sonnet-5-5`, pinned in `agents/agents.json`.** It's the model most people run Claude Code with, at a cost that keeps 27 runs per benchmark affordable. Rejected: Opus, several times the cost; Haiku, less representative and more failed runs.
- **Transcripts stay out of the repo.** results.json holds each run's usage, outcome and reason; the stream-json goes to `.bench/transcripts/`, and the CI change uploads it as an artifact. Rejected: committing transcripts, many megabytes per benchmark, mostly the tools' own file contents.
- **The runner is tested with a fake `claude`.** A small script on PATH prints canned stream-json and records its arguments and environment, so tests cover sessions, usage, failures and results without network or cost.

## Risks / Trade-offs

- [Runs cost money and vary] → 3 runs per cell, median and range shown, and the budget cap lands with the CI change.
- [`bypassPermissions` lets the agent run anything] → Runs happen in a throwaway workspace on a CI runner, never on a developer's checkout. The README will say not to run it on a machine you care about.
- [A workflow's prompts are written by specjutsu's authors] → Every prompt cites its source and can be challenged like a step. The transcripts' usage is in results.json.
- [Real installers fetch from the network] → Setup commands pin exact versions, like `pins.json`, and their sources are checked.
