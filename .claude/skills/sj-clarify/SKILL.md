---
name: sj-clarify
description: Use when a change has open questions — `[NEEDS CLARIFICATION]` markers, vague scenarios, or `sj spec check` reporting clarify lines — and they must be resolved with the user before implementation starts.
---

# Resolve a change's open questions

Ambiguity found now costs a question. Found during implementation, it costs a rewrite.

## 1. List the questions

```bash
sj spec check <change>
```

Each `clarify <question> (<file>:<line>)` line is one marker to resolve. Also look for vague
scenarios the markers missed: steps with no concrete value ("fast", "secure", "handles
errors"), a THEN that can't be observed, or two scenarios that contradict each other. Add a
marker for each.

## 2. Ask, one at a time

For each question:

- Say why it matters: which scenario or decision depends on it.
- Offer two to four concrete options, with your recommendation first and its reason.
- Accept a short answer. Don't ask the next question until this one is settled.

Ask at most about five questions per round. If more remain, ask the ones that block the most
scenarios first.

## 3. Write each answer in

- Replace the marker with the decided text, in the file and at the line where it was.
- Update every scenario the answer affects, so its WHEN and THEN use concrete values.
- If an answer adds behaviour, add a scenario and name it in a task. Write it without an ID
  and run `sj ids --write`, which gives it the next free one.
- If an answer changes the approach, update design.md's Decisions.
- Keep a `## Clarifications` list in proposal.md: `- <question> → <answer>`.

## 4. Confirm

```bash
sj spec check <change>
sj spec validate <change>
```

Done when `sj spec check` has no `clarify` lines and both commands are clean.
<!-- specjutsu:generated 26153aab70c04f1a -->
