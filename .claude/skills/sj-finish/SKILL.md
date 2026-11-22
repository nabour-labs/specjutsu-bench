---
name: sj-finish
description: Use when a change's tasks are done and it needs to land — "wrap this up", "open the PR", "archive the change", "merge it". Verifies, archives the change into specs/, and opens the PR. Also covers working on a change in its own branch or worktree.
---

# Finish a change

## Before you start: a branch per change

Work on a change in its own branch, named after it (`spec/<change>`). For parallel work on
several changes, give each its own git worktree:

```bash
git worktree add ../<repo>-<change> -b spec/<change>
```

Run `sj` commands from inside the worktree. Each has its own ledger. Remove the worktree after
the PR merges: `git worktree remove ../<repo>-<change>`.

## 1. Verify

```bash
sj verify <change>
```

Only `verify: ok` continues. Any problem line goes back to `sj-apply`, `sj-debug` or
`sj-clarify`. `sj status <change>` should show every task done.

## 2. Archive

```bash
sj spec archive <change>
```

It merges the change's deltas into `<spec_root>/specs/` and moves the folder to
`changes/archive/<date>-<change>/`. It refuses while `sj spec validate` fails or a task is
open. Fix the cause rather than passing `--force`. If the project archives after merge
instead, do this step on the default branch once the PR has merged.

Run `sj spec validate` afterwards. The merged specs must be clean.

## 3. Open the PR

- Commit the remaining work following the project's commit rules.
- Push the branch and open the PR against the default branch. The description says what
  changed and why, the scenario IDs it proves, and anything a reviewer should look at first
  (decisions from design.md, recorded principle deviations).
- CI runs `sj gate --base <default branch>`, which repeats verify's checks and adds
  red-on-base. If it fails, read its `fail` lines and fix the cause. Don't re-run hoping for
  a pass.

## 4. Other endings

If the user doesn't want a PR, offer the choices: merge locally, keep the branch for later,
or discard it. Confirm before discarding anything, and never delete a branch with unmerged
commits without a clear yes.
<!-- specjutsu:generated 6bd135a329d142e1 -->
