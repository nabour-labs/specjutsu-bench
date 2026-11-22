import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/** The workflows the benchmark compares; each has one step script per task. */
export const WORKFLOWS = ["specjutsu", "speckit", "openspec"] as const;

export type Step = {
  kind: "load" | "read" | "run" | "write" | "session";
  path?: string;
  command?: string;
  source?: string;
  note?: string;
};

export function loadTasks(root: string): string[] {
  return (JSON.parse(readFileSync(join(root, "fixture", "tasks.json"), "utf8")) as { tasks: string[] }).tasks;
}

/** Relative paths of the step scripts the tasks require, one per workflow per task. */
export function scriptPaths(tasks: string[]): string[] {
  return WORKFLOWS.flatMap((workflow) => tasks.map((task) => `steps/${workflow}/${task}.yaml`));
}

/** The required step scripts that do not exist under root. */
export function missingScripts(root: string, scripts: string[]): string[] {
  return scripts.filter((script) => !existsSync(join(root, script)));
}

export function loadSteps(root: string, script: string): Step[] {
  return (parse(readFileSync(join(root, script), "utf8")) as { steps: Step[] }).steps;
}

/** Returns one error line per step that does not cite a source; steps count from 1. */
export function checkSources(script: string, steps: Step[]): string[] {
  return steps.flatMap((step, i) => (step.source ? [] : [`${script} step ${i + 1}: missing source`]));
}
