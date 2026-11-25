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

/** specjutsu's saving against `other` as a whole percent of total input tokens, rounded down, as layer 1's. */
function saving(specjutsu: number, other: number): number {
  return Math.floor(((other - specjutsu) * 100) / other);
}

/**
 * One row per workflow per task: pass rate, and the median and range of passing runs' input
 * tokens; a total per workflow, the sum of its task medians, or `—` when a cell has no passing run;
 * and specjutsu's saving against each other workflow, or `<workflow>/<task>: no passing run` for
 * the first cell that leaves either side without a total.
 */
export function resultsMarkdown(results: AgentResults): string {
  const lines = [
    "# Agent results",
    "",
    `Model: ${results.model}. Input tokens include cache writes and reads; median and range are over passing runs.`,
    "",
    "| workflow | task | pass rate | median input tokens | range |",
    "| --- | --- | ---: | ---: | ---: |",
  ];
  // Each workflow's total input tokens, or the first of its cells with no passing run.
  const totals: Record<string, number | string> = {};
  for (const [workflow, tasks] of Object.entries(results.workflows)) {
    let total: number | string = 0;
    for (const [task, { runs }] of Object.entries(tasks)) {
      const { passed, median, min, max } = cell(runs);
      const range = median === undefined ? "—" : `${count(min ?? 0)}–${count(max ?? 0)}`;
      lines.push(`| ${workflow} | ${task} | ${passed}/${runs.length} | ${median === undefined ? "—" : count(median)} | ${range} |`);
      if (typeof total === "number") total = median === undefined ? `${workflow}/${task}: no passing run` : total + median;
    }
    lines.push(`| ${workflow} | total | | ${typeof total === "number" ? count(total) : "—"} | |`);
    totals[workflow] = total;
  }
  const specjutsu = totals.specjutsu;
  const savings = Object.keys(totals)
    .filter((workflow) => workflow !== "specjutsu")
    .map((workflow) => {
      const other = totals[workflow];
      if (typeof other === "string") return other;
      if (typeof specjutsu === "string") return specjutsu;
      return `${saving(specjutsu, other)}% vs ${workflow}`;
    });
  lines.push("", `specjutsu saves ${savings.join(", ")}`);
  return `${lines.join("\n")}\n`;
}
