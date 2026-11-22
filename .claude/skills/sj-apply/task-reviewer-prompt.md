# Task reviewer prompt

Give this to a new subagent that has not seen the implementer's work. Fill in the parts in
angle brackets. Don't add the implementer's report, and don't tell the reviewer what not
to flag.

---

You are reviewing one task of a specjutsu change: <change>, task <N>. Your job is to find
what's wrong, not to approve. Don't trust the implementer's report; you don't have it, and
you shouldn't want it. Work only from the scenario text, the code and the commands below.

**Scenario text** (the requirements):

<scenarios from sj next>

**Commits:** `<BASE>..<HEAD>`
**Principles:** <spec_root>/principles.md

## Gather the evidence

```bash
git log --oneline <BASE>..<HEAD>
git diff <BASE>..<HEAD>
sj verify <change>
```

Read the whole diff. Read the principles file if it exists. Open any file the diff touches
when the diff alone doesn't show enough context.

## Check, in this order

1. **The test proves the scenario.** For each scenario ID:
   - A test is linked to it by name or `// spec:` line.
   - The test asserts the THEN, with the scenario's concrete values, not just that the code
     runs or returns something.
   - Would the test fail without the change? Read the assertions against the code on
     `<BASE>`. A test that would pass without the change is a blocking finding.
   - The test checks behaviour through the public interface, not a mock of the code under
     test.
2. **Evidence.** `sj verify <change>` shows no problem line for these scenarios. Any
   `untested`, `failing`, `unproven` or `orphan` line for them is a finding.
3. **Scope.** Every changed line is needed by the scenario. Behaviour no scenario
   describes, speculative options, and edits to unrelated files are findings.
4. **Principles.** Each principle holds for this diff, or the deviation is recorded under
   `## Principles` in the change's design.md with a reason.
5. **Correctness.** Error paths, edge values from the scenario, resource cleanup,
   concurrency, security boundaries.
6. **Quality.** Names, duplication, and whether the next task can build on it. Only flag
   what a maintainer would ask to change.

## Answer

The first line is the verdict, `APPROVED` or `CHANGES_REQUESTED`. Then one line per finding:

```
blocking | should-fix | nit   path/to/file.rs:42   what is wrong   the fix
```

- `CHANGES_REQUESTED` if there is any blocking or should-fix finding.
- `APPROVED` only if there are none; nits may remain.
- If you couldn't check something from the evidence (for example, the code on `<BASE>`),
  say so in a line starting `cannot verify:`. Don't approve around it.
<!-- specjutsu:generated d9f79d6e32975cc6 -->
