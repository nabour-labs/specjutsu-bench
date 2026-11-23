import type { Results } from "./replay.ts";

/** Tokens are estimated as bytes / 4, as in `sj gain`. */
function tokens(bytes: number): number {
  return Math.floor(bytes / 4);
}

/** specjutsu's saving against `other` as a whole percent of context bytes, rounded down. */
function saving(specjutsu: number, other: number): number {
  return Math.floor(((other - specjutsu) * 100) / other);
}

/** One row per tool per task, a total per tool, and specjutsu's saving against each other tool. */
export function resultsMarkdown(results: Results): string {
  const lines = ["# Results", "", "| tool | task | context bytes | context tokens | output bytes |", "| --- | --- | ---: | ---: | ---: |"];
  const totals: Record<string, number> = {};
  for (const [tool, tasks] of Object.entries(results.workflows)) {
    let context = 0;
    let output = 0;
    for (const [task, script] of Object.entries(tasks)) {
      lines.push(`| ${tool} | ${task} | ${script.context} | ${tokens(script.context)} | ${script.output} |`);
      context += script.context;
      output += script.output;
    }
    lines.push(`| ${tool} | total | ${context} | ${tokens(context)} | ${output} |`);
    totals[tool] = context;
  }
  const others = Object.keys(totals).filter((tool) => tool !== "specjutsu");
  const savings = others.map((tool) => `${saving(totals.specjutsu, totals[tool])}% vs ${tool}`);
  lines.push("", `specjutsu saves ${savings.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

/**
 * How `fresh` differs from the `committed` results: every changed pin, then the first step
 * whose bytes differ, counting steps from 1. Empty when they match.
 */
export function drift(committed: Results, fresh: Results): string[] {
  const tools = [...new Set([...Object.keys(committed.pins), ...Object.keys(fresh.pins)])].sort();
  const lines = tools
    .filter((tool) => committed.pins[tool] !== fresh.pins[tool])
    .map((tool) => `pin ${tool} ${committed.pins[tool] ?? "none"} → ${fresh.pins[tool] ?? "none"}`);
  const step = firstStepDrift(committed, fresh);
  if (step) lines.push(step);
  if (lines.length === 0 && JSON.stringify(committed) !== JSON.stringify(fresh)) lines.push("results differ");
  return lines;
}

function firstStepDrift(committed: Results, fresh: Results): string | undefined {
  for (const [tool, tasks] of Object.entries(fresh.workflows)) {
    for (const [task, script] of Object.entries(tasks)) {
      const old = committed.workflows[tool]?.[task]?.steps ?? [];
      for (let i = 0; i < Math.max(old.length, script.steps.length); i++) {
        for (const field of ["context", "output"] as const) {
          const before = old[i]?.[field] ?? 0;
          const after = script.steps[i]?.[field] ?? 0;
          if (before !== after) return `${tool}/${task} step ${i + 1}: ${field} ${before} → ${after}`;
        }
      }
    }
  }
  return undefined;
}
