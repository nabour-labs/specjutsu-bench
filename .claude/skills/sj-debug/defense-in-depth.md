# Defense in depth

When bad data caused a bug, one check at the root cause fixes this bug. It doesn't stop the
next caller, a refactor or a test fixture from sending the same bad data along another
path. Where the bad value passed through several layers, add a check at each one, so the
bug becomes impossible instead of merely fixed.

Do this after the root cause is fixed and its scenario test is green, not instead of it.

## The layers

Take a ledger that ended up in the home folder because `--root` resolved to the wrong
place. The fix for the root cause is in how the root is found. The checks around it:

1. **At the boundary.** Where outside input arrives: CLI arguments, config files, hook
   JSON on stdin, environment variables. Reject what is clearly wrong (an empty path, a
   `--root` that has no `specjutsu.toml` or `.git`) with a message that says what was
   expected.
2. **At the point of use.** The function that relies on an assumption states it: the
   ledger writer checks that its folder is inside the repository root it was given. This
   catches callers that never went through the boundary: other modules, tests, later code.
3. **Before anything irreversible.** Deleting files, rewriting a user's config, committing,
   spending money. Refuse when the context can't be right: for example, `sj update` never
   deletes a file that doesn't carry the generated marker.
4. **Leave a trail.** Where a value crosses something hard to see into (a subprocess, an
   agent hook, a CI step), log enough to trace it back next time: the value, and where it
   came from.

## How to apply it

- List the path the bad value took, from where it entered to where it did damage.
- Add a check at each layer on that path that could have stopped it. Not every layer needs
  all four kinds; pick the ones that would have caught this bug.
- Each check gets a test, linked to the bug's scenario or to a new scenario for that
  layer. A new check is new behaviour, so it fails on the base branch: don't mark it
  `[keep]`. Use `[keep]` only for behaviour next to the bug that must not change.
- Then try to get past each check: call the inner function directly, pass the value from a
  test fixture, set the environment differently. If one of these still causes the bug, a
  layer is missing.

## Keep it proportionate

- Checks go on the path the bug actually took, not on every function in the codebase.
- A check that can never fail, because the type system already rules the value out, is
  noise. Use the type instead.
- Don't swallow the error at the outer layer to make it go away. A check fails loudly with a
  message that says what was wrong.
<!-- specjutsu:generated 809468b6f40f7149 -->
