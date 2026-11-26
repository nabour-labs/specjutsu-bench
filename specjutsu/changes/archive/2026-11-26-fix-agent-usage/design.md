## Context

`parseCall` (src/agents/usage.ts) sums each assistant turn's usage, taking the largest value of
each field across a message's lines. That is right for the input fields, which every line of a
message repeats, and it matches Claude Code's result message exactly. For output it isn't:
Claude Code prints the assistant lines while the message is still being generated, so
`output_tokens` on them is a partial count, and the final count is only in the call's result
message.

The feature task's golden tests pin an interface the prompt doesn't state.

## Goals / Non-Goals

**Goals:**

- Output tokens match what Claude Code reports per call.
- A feature run passes or fails on behaviour, not on guessing a file name or an error message.

**Non-Goals:**

- Changing how input tokens are counted. They match the result message, and they also count
  subagent turns that the result message may not.
- Rewording the bugfix and change prompts. Their golden tests use only `src/invoice.ts`, which
  already exists, and the existing functions.

## Decisions

- **Output from the result message.** Rejected: reading output from the last assistant line of
  each message. It is still the count at that line's print time, which isn't guaranteed final.
- **Spell out the interface in the prompt, the same words for every workflow.** A spec-driven
  user names the module and the error when the code must fit existing callers, and every
  workflow gets exactly the same extra text, so the comparison stays fair. Rejected: loosening
  the golden test to import from `src/index.ts`. That still pins names and the error text, and
  it changes layer 1's golden end state.
- **Leave `fixture/tasks.json` alone.** Its description is documentation that no code reads, but
  the file is part of every cell's fingerprint (AGENT-039). Changing it would throw away the
  bugfix and change runs already saved.

- **Unattended by flag and one fixed line, the same for every workflow.** Turning off the
  question tool alone could leave the agent asking in plain text and stopping. The appended line
  says what to do instead. It goes through `--append-system-prompt`, not the prompt scripts, so
  the cited prompts stay as each workflow's docs give them. Rejected: counting an unanswered
  question against the workflow that asked, which makes the result depend on whether the model
  happened to ask; and scripting answers, which needs the question known in advance.
- **The fixed arguments are fingerprinted.** A run made with different `claude` arguments measured
  a different harness. Rejected: a hand-bumped harness version, which is easy to forget.

## Risks / Trade-offs

- [The appended line is text no workflow's docs prescribe] -> It is the same for all three and
  only matters when the agent would ask; the README lists it as a harness rule.

- [Subagent output tokens may not be in the result message] -> Unknown until a run shows
  `parent_tool_use_id` lines. The first real pass showed none. Input tokens still count them.
- [The prompts now differ from `fixture/tasks.json`'s description] -> The README says the feature
  prompt adds the interface the golden test checks.
