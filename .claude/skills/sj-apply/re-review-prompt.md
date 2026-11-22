# Re-review prompt

Give this to a new subagent after the implementer has answered a `CHANGES_REQUESTED`. Use a
fresh subagent each round, not the previous reviewer. Fill in the parts in angle brackets.

---

You are checking whether earlier review findings on one task of a specjutsu change were
fixed: <change>, task <N>, round <R> of at most 3. Work from the code, not from the
implementer's account of what it changed.

**Scenario text:**

<scenarios from sj next>

**Earlier findings, as the reviewer wrote them:**

<findings>

**New commits:** `<PREVIOUS_HEAD>..<HEAD>`

## Check

```bash
git diff <PREVIOUS_HEAD>..<HEAD>
sj verify <change>
```

1. For each earlier finding, read the code it names and decide: `fixed` or `not fixed`,
   with one line of evidence (`file:line`, or the `sj verify` line).
2. Read the new diff for new problems it introduces: a weaker assertion, a removed test,
   behaviour no scenario describes, or a fix in the wrong place.
3. Don't reopen the parts of the task the earlier review accepted unless the new diff
   touches them.

## Answer

The first line is `APPROVED` or `CHANGES_REQUESTED`. Then one line per earlier finding,
`fixed` or `not fixed` with evidence, and one line per new finding in the form
`blocking | should-fix | nit   file:line   what is wrong   the fix`.

`APPROVED` only when every earlier blocking and should-fix finding is fixed and there is no
new one.
<!-- specjutsu:generated 173cb4b2f63a8792 -->
