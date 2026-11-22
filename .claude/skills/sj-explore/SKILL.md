---
name: sj-explore
description: Use when an idea, feature request or problem is still vague and needs thinking through before anything is specified or built — "let's explore", "how should we approach", "what are the options". Produces a shared understanding, not code.
---

# Explore before you specify

Think with the user. Nothing gets written to `specs/` or the code here. The output is a
clear problem, the options, and a direction the user agrees with, ready for `sj-propose`.

## 1. Get your bearings cheaply

- `sj status` shows the open changes and where each stands. Is this idea already one of them?
- `sj spec list` shows open changes with task and scenario counts.
- Read only the capability specs the idea touches: `<spec_root>/specs/<capability>/spec.md`.
  Find them by name. Don't read every spec.
- If `<spec_root>/principles.md` exists, read it. Options that break a principle need a reason.

## 2. Understand the problem

Ask one question at a time, and prefer multiple choice when the options are known. Find out:

- **Who** has the problem and **what** they're trying to do.
- **Why now:** what happens if nothing changes.
- **Boundaries:** what's explicitly out of scope.
- **Done:** how the user will know it works. Write each answer as WHEN/THEN. These become
  scenarios later.

Stop asking when you could write the scenarios yourself.

## 3. Lay out the options

Give two or three approaches, each with:

- what it changes (capabilities, files, data),
- the trade-off (cost, risk, what it rules out),
- which scenarios it makes easy or hard.

Recommend one and say why. Use a diagram when structure or flow matters.

## 4. Check the size

One change should be reviewable in one sitting. If the idea needs more than about a dozen
scenarios, or spans unrelated capabilities, split it into changes the user can ship one at
a time, and say which comes first.

## 5. Hand off

Summarize in a few lines: the problem, the chosen approach, what's out of scope, and the
WHEN/THEN outcomes. Then continue with `sj-propose`, which turns this into a change folder.

Rules:

- Don't write code or tests here.
- Don't create a change folder here. That's the first step of `sj-propose`.
- Write open questions down as `[NEEDS CLARIFICATION: <question>]` rather than guessing.
  `sj-clarify` resolves them.
<!-- specjutsu:generated 682b41c40f69d240 -->
