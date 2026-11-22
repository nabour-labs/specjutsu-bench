# Root-cause tracing

Where a bug shows and where it starts are usually far apart: a ledger written to the
wrong folder, a query with an empty id, a panic on `None`. Fixing it where it shows leaves
the cause in place. Trace the bad value back to where it was first wrong, and fix it there.

## The steps

1. **Write down the symptom exactly.** "`sj test` writes `.specjutsu/ledger/runs.jsonl`
   in the home folder instead of the repository" is better than "the ledger is broken".
2. **Find the line that misbehaves.** The function call, write or comparison that does
   the wrong thing. Note the value it got.
3. **Ask what called it with that value.** Go up one frame. Is the value already wrong
   here, or does this frame make it wrong?
4. **Repeat until you find where it was created.** The first place a correct value turns
   into a wrong one is the root cause. It is often a default (`""`, `0`, `.`), a value read
   too early (before setup ran), a path built from the wrong base, or a copy that was
   changed later.
5. **Fix it there.** Then decide whether the layers in between should also check it
   (`defense-in-depth.md`).

## When you can't follow it by reading

Add one temporary log line just before the operation that misbehaves, and print the value,
where you are, and how you got there:

```rust
eprintln!("DEBUG write: path={path:?} cwd={:?}\n{}", std::env::current_dir(),
    std::backtrace::Backtrace::force_capture());
```

```ts
console.error("DEBUG write", { path, cwd: process.cwd(), stack: new Error().stack });
```

- Print to stderr in tests; a logger may be silenced.
- Log before the operation, not after it fails.
- Run the narrowest test that shows it, keep the output, and read the stack from the
  bottom up.
- Remove every debug line before you commit.

## When a test pollutes state and you don't know which

The symptom shows up in test B, but only when the whole suite runs. Some earlier test leaves
something behind: a file, an environment variable, a global.

1. Run test B alone. If it passes, something before it is the cause.
2. Bisect: run the first half of the suite plus B, then the second half plus B, and keep
   the half that still fails until one test is left.
3. Check what that test creates and never cleans up. The fix is in that test's setup or
   teardown, usually a temp folder, not a fixed path.

## Signs you stopped too early

- The fix adds a check for the bad value at the place it caused damage, and nowhere else.
- You can't say where the bad value was first created.
- The fix works for this input but you can name another input that would still break it.
<!-- specjutsu:generated 154fdff58325708d -->
