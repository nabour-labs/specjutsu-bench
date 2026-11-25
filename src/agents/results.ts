import type { Pins } from "../pins.ts";
import type { Run, Runs } from "./run.ts";

/** What `results/agent/results.json` holds: the model, the pins, and every run by workflow and task. */
export type AgentResults = { model: string; pins: Pins; workflows: Record<string, Record<string, { runs: Run[] }>> };

/** A cell's passing runs out of all its runs, and the median, minimum and maximum input tokens of the passing ones. */
type Cell = { passed: number; runs: number; median?: number; min?: number; max?: number };

export function agentResults(model: string, pins: Pins, runs: Runs): AgentResults {
  const workflows = Object.fromEntries(
    Object.entries(runs).map(([workflow, cells]) => [
      workflow,
      Object.fromEntries(Object.entries(cells).map(([task, cellRuns]) => [task, { runs: cellRuns }])),
    ]),
  );
  return { model, pins, workflows };
}

/** A cell's pass rate and its input tokens over passing runs; the median of an even count is the lower middle value. */
function cell(runs: Run[]): Cell {
  const tokens = runs
    .filter((run) => run.outcome === "passed")
    .map((run) => run.inputTokens)
    .sort((a, b) => a - b);
  if (tokens.length === 0) return { passed: 0, runs: runs.length };
  return {
    passed: tokens.length,
    runs: runs.length,
    median: tokens[Math.floor((tokens.length - 1) / 2)],
    min: tokens[0],
    max: tokens[tokens.length - 1],
  };
}

/** A whole number with thousands separators: `12,000`. */
function count(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** One row per workflow per task: pass rate, and the median and range of passing runs' input tokens. */
export function resultsMarkdown(results: AgentResults): string {
  const lines = [
    "# Agent results",
    "",
    `Model: ${results.model}. Input tokens include cache writes and reads; median and range are over passing runs.`,
    "",
    "| workflow | task | pass rate | median input tokens | range |",
    "| --- | --- | ---: | ---: | ---: |",
  ];
  for (const [workflow, tasks] of Object.entries(results.workflows)) {
    for (const [task, { runs }] of Object.entries(tasks)) {
      const { passed, median, min, max } = cell(runs);
      const range = median === undefined ? "—" : `${count(min ?? 0)}–${count(max ?? 0)}`;
      lines.push(`| ${workflow} | ${task} | ${passed}/${runs.length} | ${median === undefined ? "—" : count(median)} | ${range} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}
