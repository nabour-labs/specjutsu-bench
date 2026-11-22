# Condition-based waiting

A test that sleeps for a fixed time and then checks is guessing how long something takes.
It passes on a fast laptop and fails on a loaded CI runner, or it passes everywhere and
wastes seconds per test. Wait for the condition you care about instead.

## The pattern

Instead of "sleep, then check", write "check until true, or give up with a clear error":

```rust
fn wait_for<T>(what: &str, timeout: Duration, mut check: impl FnMut() -> Option<T>) -> T {
    let start = Instant::now();
    loop {
        if let Some(v) = check() {
            return v;
        }
        if start.elapsed() > timeout {
            panic!("timed out after {timeout:?} waiting for {what}");
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

// Read the log inside the check, so each try sees new output.
let line = wait_for("the server to print its port", Duration::from_secs(5), || {
    let log = std::fs::read_to_string(&log_path).ok()?;
    log.lines().find(|l| l.starts_with("listening on")).map(str::to_owned)
});
```

```ts
async function waitFor<T>(what: string, check: () => T | undefined, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    const v = check();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
```

## What to wait for

| You want | Wait for |
| --- | --- |
| a file to be written | the file exists and has the expected content, not just exists |
| a server to start | it accepts a connection, or prints its ready line |
| a process to finish | its exit status |
| an event to fire | the event, counted, with the data you expect |
| state to change | the new state, read fresh each time |

## Mistakes to avoid

- **Polling too fast.** A loop with no sleep burns a CPU core and can starve what you're
  waiting for. 10 ms is a good default.
- **No timeout.** Always give up eventually, with a message that names what you were
  waiting for.
- **Stale values.** Read the state inside the check, not once before the loop.
- **Waiting for the wrong thing.** "The file exists" is true before it's fully written.
  Wait for the content.

## When a fixed delay is right

Only when time itself is the behaviour under test: a debounce, a rate limit, a timeout.
Then first wait for the condition that starts the clock, use a delay derived from the known
interval rather than a guess, and write down why in a comment. Better still, inject a clock
and advance it in the test.
<!-- specjutsu:generated 4d3cf3b877d8aa75 -->
