---
name: sj-debug
description: Use when something is broken — a bug report, a failing test, an error or unexpected behaviour. Finds the root cause in four phases and captures it as a failing scenario test before any fix.
---

# Debug from evidence

No fix without a root cause, and no root cause without evidence. A fix you can't explain
is a guess, and guesses pile up into new bugs. Work through the four phases in order. The
pressure to skip them is highest when the bug looks obvious or time is short, and that is
when skipping costs the most.

## Phase 1: Investigate the root cause

1. **Read the error completely.** The whole message, the stack trace, line numbers, error
   codes. Read the failure excerpt `sj test` prints, not raw logs.
2. **Reproduce it.** Get the exact input, expected output and actual output. Run the
   narrowest test first: `sj test <ID>` for the scenario that covers the behaviour, or
   `sj test <package>`. If you can't reproduce it, say so and ask for what's missing. Don't
   fix what you can't see.
3. **Check what changed.** `git log -p` on the files involved, recent dependency or config
   changes, and `sj status` for open changes touching the area.
4. **Trace it back.** The place the error shows is rarely where it starts. Follow the bad
   value back through its callers to where it was first wrong, using
   `root-cause-tracing.md`. In a system with several layers (CLI → library → filesystem,
   or service → service), log what goes in and out at each boundary once, run it, and see
   which layer breaks before you dig into any one.

## Phase 2: Compare with what works

- Find similar code in the same repository that works, and list every difference, however
  small.
- If you're using a library or pattern, read its reference documentation fully, not just
  the example.
- Write down what the broken code assumes: inputs, environment, ordering, timing.

## Phase 3: One hypothesis at a time

1. State it: "the token is compared before it's decoded, because X".
2. Name the one check that would confirm or refute it (a log line, a debugger step, a
   smaller input), and run only that.
3. If it's refuted, write down what you ruled out and form the next one. Don't stack a
   second change on top of the first.

If you don't understand something, say so. Don't fill the gap with a plausible story.

If the investigation ends without a cause in the code, because it is really the
environment, the network or timing, write down what you ruled out and how, add a check or
a condition-based wait where it fails, and tell the user the cause is unproven.

## Phase 4: Capture it, then fix it

### Capture it as a scenario

- If an existing scenario describes the right behaviour and its test missed the bug, add
  the case to that scenario's test, or add a new scenario.
- If no scenario describes it, add one to the open change, or create a change with
  `sj spec new fix-<bug> --bug`. Write the scenario with the concrete failing values, and
  name it in a task.
- Pin what the fix must not change: for behaviour next to the bug, add a `[keep]` scenario
  (`#### Scenario: FIX-002 [keep] Refunds over $100 still need approval`). Its test must
  pass before and after the fix; the gate reports `keep-red-on-base` if it doesn't.

Write the test, linked by the scenario ID, and record it red with `sj test FIX-001`. It
must fail the way the bug report says. Commit it: `test(FIX-001): red`.

### Fix the cause

- Make one change, at the root cause, not where the symptom showed. Run `sj test FIX-001`
  until it's green, then `sj test <package>` to check nothing else broke. Commit it as
  `feat(FIX-001): green`: the gate's history check pairs `test(…): red` with `feat(…)`.
- Where bad data crossed several layers to reach the bug, add a check at each layer it
  passed through, so it can't recur another way. See `defense-in-depth.md`.
- If the bug is a timing or flaky-test problem, don't add a sleep. Wait for the condition;
  see `condition-based-waiting.md`.

### After 3 failed fixes, stop

If three fixes in a row didn't work, or each fix shows a new problem somewhere else, the
problem is probably the design, not the code. Stop fixing. Tell the user what you tried,
what each attempt showed, and why you think the structure is wrong. Questioning the design
after 3 failed fixes is the next step; a fourth attempt is not.

## Report

In a few lines: the cause, why the existing tests missed it, the fix, and any similar code
that may have the same bug. Suggest a scenario for that code; don't fix it unasked.

## Rationalizations

| Thought | Reality |
| --- | --- |
| "It's obvious, I'll just fix it." | Obvious bugs have causes too. Phase 1 is minutes. |
| "No time to investigate, it's urgent." | Guessing takes longer than investigating, and leaves new bugs. |
| "I'll write the test after the fix." | A test written after the fix never saw the bug. |
| "Let me try a few things at once." | Then you won't know which one worked, or what broke. |
| "One more fix will do it." (after 3) | Three failures point at the design. Stop and say so. |
| "A sleep makes the test pass." | It hides the race until CI is slower. |

## Red flags

Stop and go back to Phase 1 if you catch yourself:

- proposing a fix before you can say where the bad value comes from,
- changing code to "see if it helps",
- making several changes before running the test,
- saying "it's probably X" without having checked X,
- adding a retry, a sleep or a broader `catch` to make an error go away,
- on a fourth fix attempt.
<!-- specjutsu:generated 48d4b36cc8738fd1 -->
