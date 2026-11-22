---
name: sj-principles
description: Use when a project needs its standing engineering principles written down or changed — "set up our principles", "add a rule that…", or a constitution. Creates or amends <spec_root>/principles.md, which planning and review check against.
---

# Write the project's principles

`<spec_root>/principles.md` holds the rules every change is measured against. `sj next`
points the agent at it, and `sj-propose` and `sj-review` check designs against it.

## 1. Read what exists

- If the file exists, read it whole. It should be short.
- Read the project's own conventions: CLAUDE.md or AGENTS.md, CONTRIBUTING, the
  `specjutsu.toml` mode. Don't restate what those already enforce.

## 2. Draft or amend with the user

Each principle is:

```markdown
### P3. Tests run without the network
Every test runs offline. Code that calls a service takes the client as a parameter.

**Why:** CI has no network, and flaky tests hide real failures.
```

- **Numbered** (`P1`, `P2`, …) so designs can cite them. Never renumber. A retired principle
  keeps its number and says `Retired: <date> — <reason>`.
- **Testable:** a reviewer can tell from a diff whether it holds. "Write clean code" is not a
  principle; "No function over 60 lines" is.
- **With a reason**, so people can judge the edge cases.

Aim for 5–12 principles. Ask the user before adding one they didn't state, one question at a
time.

## 3. Record the amendment

At the end of the file keep a list: `- <date>: added P7, retired P2 (<reason>)`. A principle
added after a change was designed doesn't apply to that change retroactively. Its review
notes it instead.

## 4. Hand back

Show the user the principles that changed, not the whole file. If an open change now deviates
from a new principle, name the change (`sj status` lists them) so its design can record the
deviation.
<!-- specjutsu:generated 550e9b3a5fe506eb -->
