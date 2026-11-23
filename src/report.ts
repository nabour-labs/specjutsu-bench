import type { GainTotals, Results } from "./replay.ts";

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
 * How `fresh` differs from the `committed` results: every changed pin (`none` where a side has
 * no pin), then the first script that is missing, added or has a step whose bytes differ, its
 * steps numbered as in the script. `results differ` when only something else changed. Empty when
 * they match.
 */
export function drift(committed: Results, fresh: Results): string[] {
  const tools = [...new Set([...Object.keys(committed.pins), ...Object.keys(fresh.pins)])].sort();
  const lines = tools
    .filter((tool) => committed.pins[tool] !== fresh.pins[tool])
    .map((tool) => `pin ${tool} ${committed.pins[tool] ?? "none"} → ${fresh.pins[tool] ?? "none"}`);
  const script = firstScriptDrift(committed, fresh);
  if (script) lines.push(script);
  if (lines.length === 0 && JSON.stringify(committed) !== JSON.stringify(fresh)) lines.push("results differ");
  return lines;
}

function union(a: object, b: object): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}

function firstScriptDrift(committed: Results, fresh: Results): string | undefined {
  for (const tool of union(fresh.workflows, committed.workflows)) {
    const freshTasks = fresh.workflows[tool] ?? {};
    const committedTasks = committed.workflows[tool] ?? {};
    for (const task of union(freshTasks, committedTasks)) {
      const now = freshTasks[task];
      const old = committedTasks[task];
      if (!now) return `${tool}/${task}: missing`;
      if (!old) return `${tool}/${task}: added`;
      for (let i = 0; i < Math.max(old.steps.length, now.steps.length); i++) {
        for (const field of ["context", "output"] as const) {
          const before = old.steps[i]?.[field] ?? 0;
          const after = now.steps[i]?.[field] ?? 0;
          if (before !== after) return `${tool}/${task} step ${i + now.firstStep}: ${field} ${before} → ${after}`;
        }
      }
    }
  }
  return undefined;
}

/** One line per `sj` command whose bytes in the replay differ from what `sj gain` reports. */
export function gainMismatches(gain: GainTotals): string[] {
  return Object.entries(gain)
    .filter(([, totals]) => totals.replay !== totals.gain)
    .map(([command, totals]) => `sj gain mismatch for ${command}: replay ${totals.replay}, sj gain ${totals.gain}`);
}
