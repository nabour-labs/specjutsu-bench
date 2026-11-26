## ADDED Requirements

### Requirement: Runs are unattended, the same way for every workflow
No one answers an agent's questions in a run. Every `claude` call SHALL pass
`--disallowedTools AskUserQuestion` and `--append-system-prompt` with the line `No one can answer
questions in this run. Where you would ask the user, choose the option you would recommend, say
which you chose, and continue.`, for every workflow alike. These fixed arguments SHALL be part of
every run's fingerprint, so changing them does every saved run again.

#### Scenario: AGENT-045 Every call is told no one can answer
- **WHEN** the runner makes any `claude` call
- **THEN** its arguments include `--disallowedTools AskUserQuestion` and `--append-system-prompt` followed by that line, for specjutsu, speckit and openspec alike

#### Scenario: AGENT-046 The fixed claude arguments are part of the fingerprint
- **WHEN** the fingerprint of `speckit/feature` is taken with the runner's fixed `claude` arguments and again with one of them changed
- **THEN** the two fingerprints differ

## MODIFIED Requirements

### Requirement: A run's usage is summed from every turn
The runner SHALL read the usage of every assistant turn in the stream-json output of every call in
a run. Claude Code prints one assistant line per content block, each repeating its message's usage,
so lines that share a `message.id` SHALL count as one turn, with the largest value each input field
reaches on those lines. Turns of subagents the agent starts
(lines with a `parent_tool_use_id`) SHALL count like any other turn. A run's input tokens are the sum of `input_tokens`, `cache_creation_input_tokens` and
`cache_read_input_tokens`; its output tokens the sum of each call's result message
`usage.output_tokens`, since an assistant line carries its message's output count as it was when
the line was printed, not the final count; its cost the sum of each call's reported `total_cost_usd`. A call that exits non-zero, prints no result message, or runs longer than the call timeout
(`--timeout <seconds>`, default 1800) marks the run failed with that reason, and the runner goes
on to the next run. Whether a failed run is saved follows the requirement on saved runs.

#### Scenario: AGENT-006 Input tokens include cache writes and reads
- **WHEN** a run's turns report `input_tokens` 1,000 and 400, `cache_creation_input_tokens` 200 and 0, and `cache_read_input_tokens` 5,000 and 6,000
- **THEN** the run records input tokens 12,600

#### Scenario: AGENT-017 Lines of one message count once
- **WHEN** a call prints three assistant lines with the same `message.id`, each with `input_tokens` 1,000, and one more line with another id and `input_tokens` 2,000
- **THEN** the run records input tokens 3,000 and 2 turns

#### Scenario: AGENT-029 A message's usage is its largest on any of its lines
- **WHEN** two lines of message `m1` report `input_tokens` 1,000 on both and `cache_read_input_tokens` 5,000 and then 4,000
- **THEN** the run records input tokens 6,000 and 1 turn

#### Scenario: AGENT-024 A subagent's turns count
- **WHEN** a call prints one assistant line with `input_tokens` 1,000 and no `parent_tool_use_id`, and two subagent lines with `parent_tool_use_id` set and `input_tokens` 4,000 and 6,000
- **THEN** the run records input tokens 11,000 and 3 turns

#### Scenario: AGENT-007 A call that fails marks the run failed and the benchmark goes on
- **WHEN** the fake `claude` exits 1 on the second prompt of a run's first of three runs
- **THEN** the runner prints `speckit/feature run 1: prompt 2: claude exited 1 (not saved, will be retried)`, that run is not in the results, and the other two runs still run

#### Scenario: AGENT-016 A call that runs past the timeout fails the run
- **WHEN** the runner runs with `--timeout 1` and the fake `claude` sleeps 5 seconds on the first prompt
- **THEN** that run is recorded as failed with `prompt 1: claude timed out after 1s`

#### Scenario: AGENT-044 Output tokens come from each call's result message
- **WHEN** a run makes two calls, the first printing assistant lines with `output_tokens` 10 and 20 and a result message with `usage.output_tokens` 900, and the second a result message with `usage.output_tokens` 100
- **THEN** the run records output tokens 1,000
