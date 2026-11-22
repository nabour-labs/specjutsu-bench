---
name: sj-onboard
description: Use when someone is new to specjutsu and wants to see how it works — "show me how this works", "walk me through it", "onboard me". Runs one complete change on a toy scenario in a scratch change, sj-onboard-demo, then removes it.
---

# Walk a first change end to end

Show the whole loop once, on something small, so the user sees every command do its job.
Everything happens in a scratch change named `sj-onboard-demo`, and everything is removed at
the end, so the project's specs are unchanged.

Before each step, explain it in one or two sentences: what the command does and why the
loop needs it. Then run it and show the output that matters.

## 0. Check the start

Run `git status`. Stop, and tell the user why, when:

- it shows uncommitted changes: the demo's cleanup must not touch their work. Ask them to
  commit or stash first.
- `changes/sj-onboard-demo/` exists under the spec root: an earlier demo was left behind,
  or the name is in use. Ask them to look at it and remove it themselves.

Don't continue until both are clear.

## 1. Create the change

```bash
sj spec new sj-onboard-demo
```

Explain: every behaviour starts as a change with a proposal, a delta spec and tasks.

In `changes/sj-onboard-demo/`, write a one-line proposal, a delta spec with one requirement
and one scenario, and one task naming it. Pick a toy behaviour that takes a few lines, such
as a function that greets a name. Give the scenario the ID `DEMO-001`, or a prefix from
`principles.md` if the project restricts prefixes. Run `sj spec check` and fix what it
reports.

## 2. Write the failing test

Write one test for the scenario, with its ID in the name, where the project's test globs
find it. Then record the red run:

```bash
sj test DEMO-001
```

Explain: the ledger records this failing run. A scenario counts as proven only when a red
run comes before a green one, so the test can't have been written to pass.

## 3. Make it pass

Write the smallest code that passes, then run `sj test DEMO-001` again and show it green.

## 4. Close the task

```bash
sj task done sj-onboard-demo 1.1
```

Explain: tasks close through `sj`, never by editing the checkbox, so the evidence is checked
first. In real work, `sj-apply` hands each task to an implementer subagent and a fresh
reviewer subagent, and closes it only after the reviewer approves; the demo does it all in
one place to show the steps.

## 5. Verify

```bash
sj verify sj-onboard-demo
```

Explain: only `verify: ok` means done. Any other line is work left.

## 6. Clean up

Delete everything the demo added:

- the folder `changes/sj-onboard-demo/`
- the demo test
- the demo code

Don't archive the demo change. Archiving would merge the toy scenario into the project's
specs. Run `git status` and show the user that the working tree is clean again; the ledger
in `.specjutsu/ledger/` is not tracked and keeps the demo runs, which is harmless.

## 7. Point onward

Tell the user where real work starts: `sj-explore` for a vague idea, `sj-propose` for an
agreed one, `sj-apply` to implement, `sj-finish` to land it.
<!-- specjutsu:generated 11678135779c5477 -->
