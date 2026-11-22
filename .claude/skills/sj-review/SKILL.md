---
name: sj-review
description: Use when a change needs reviewing — before asking for a PR review, when reviewing someone else's change, or when responding to review comments. Checks the diff against its scenarios and the project's principles.
---

# Review a change against its spec

A review answers three questions: does the code do what the scenarios say, only that, and
does it hold to the principles?

## 1. Gather the evidence, not the folders

```bash
sj status <change>     # tasks and scenario evidence
sj verify <change>     # what CI would fail on, minus red-on-base
git diff <base>...HEAD --stat
```

Read the change's proposal.md and design.md, the scenarios it adds or modifies (`sj next`
shows them per task), and the diff. If `<spec_root>/principles.md` exists, read it.

## 2. Check

- **Scenarios:** each added or modified scenario has a test that asserts its THEN with its
  values, not just that the code runs. A test that would pass without the change is a finding.
- **Scope:** code that no scenario or task explains, or a task marked done without its
  scenario tested.
- **Principles:** each principle in principles.md holds for this diff. A deviation is
  acceptable only if it's recorded under `## Principles` in the change's design.md with a
  reason. An unrecorded deviation is a finding: either fix the code or record the deviation
  and its reason in design.md.
- **Correctness:** error paths, edge values from the scenarios, concurrency, security
  boundaries.
- **Checklist:** if the change or project has a checklist (a `checklists/` folder or a
  `## Checklist` in design.md), go through each item and mark it.

Delegate: reading a large diff file by file can go to subagents, one per area, each returning
findings with file and line.

## 3. Report

One line per finding: severity (blocking, should-fix, nit), `file:line`, what's wrong, and
the fix. Lead with blocking findings. Say plainly when there are none.

## Receiving a review

For each comment:

1. Check it against the code and the scenarios before agreeing. Reviewers can be wrong.
2. If it's right, fix it. If behaviour changes, update the scenario first, then follow
   `sj-apply`'s red–green steps for it.
3. If it's wrong, reply with the evidence: the scenario, the test, the line.
4. Don't make changes nobody asked for while addressing a comment.

Run `sj verify <change>` after the fixes.
<!-- specjutsu:generated 969535dd77e17419 -->
