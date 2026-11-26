## Why

The first agent pass under `resume-agent-runs` showed two flaws in the benchmark itself.

- The feature task's golden test imports `dueDate` and `PaymentTerms` from `src/terms.ts` and
  expects the error `invoice INV-9: unknown payment terms net-60`, but the feature prompt names
  neither the module nor the error. specjutsu's run got the behaviour and the names right but put
  them in `src/invoice.ts`, so the golden test couldn't import them and the run failed. Every
  workflow has to guess the same thing, so the feature cells measure luck, not the workflow.
- Output tokens are undercounted about 7 times. In stream-json, an assistant line carries its
  message's output count as it was when the line was printed, not the final one: one call's
  lines sum to 888 where its result message reports 6,215. Input tokens match the result message
  exactly, so the headline is unaffected, but `results/agent/results.json` reports wrong output
  numbers.

## What Changes

- A run's output tokens are the sum of each call's result message `usage.output_tokens`. Input
  tokens are still summed per turn, deduplicated by `message.id`.
- The three feature prompts (specjutsu, speckit, openspec) state the interface the golden test
  checks, in the same words: a new `src/terms.ts` exporting a `PaymentTerms` type of
  `"due-on-receipt" | "net-15" | "net-30"` and `dueDate(invoice)` returning the due date as
  `YYYY-MM-DD`, an optional `terms` field on `createInvoice`'s input, and
  `InvoiceError("invoice <id>: unknown payment terms <terms>")` for any other value. Only the
  feature prompts change, so only the feature cells' fingerprints change, and the next start
  redoes just those runs.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-runs`: output tokens come from each call's result message.

## Impact

- Code: `src/agents/usage.ts`.
- Tests: `test/agents.test.ts`, and the fake `claude` in `test/agent-helpers.ts` if it needs a
  separate result-message output count.
- Agent scripts: `agents/{specjutsu,speckit,openspec}/feature.yaml`. `fixture/tasks.json` is left as
  it is, because it is part of every cell's fingerprint and changing it would redo every run.
- README: the agent-run results section, if it describes output tokens.
