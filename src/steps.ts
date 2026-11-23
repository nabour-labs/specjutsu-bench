import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import type { Pins } from "./pins.ts";

/** The workflows the benchmark compares; each has one step script per task. */
export const WORKFLOWS = ["specjutsu", "speckit", "openspec"] as const;

export type Step = {
  kind: "load" | "read" | "run" | "write" | "session";
  tool?: string;
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

/** The file listing what a workflow's agent loads at the start of every session. */
export function sessionScript(workflow: string): string {
  return `steps/${workflow}/session.yaml`;
}

/** The session-start steps of a workflow; none when it has no session.yaml. */
export function loadSessionSteps(root: string, workflow: string): Step[] {
  const script = sessionScript(workflow);
  return existsSync(join(root, script)) ? loadSteps(root, script) : [];
}

/** Returns one error line per step of a session-start list that is not a load step. */
export function checkSessionKinds(script: string, steps: Step[]): string[] {
  return steps.flatMap((step, i) =>
    step.kind === "load" ? [] : [`${script} step ${i + 1}: only load steps are allowed in session.yaml`],
  );
}

export function loadSteps(root: string, script: string): Step[] {
  return (parse(readFileSync(join(root, script), "utf8")) as { steps: Step[] }).steps;
}

/** Returns one error line per step that does not cite a source; steps count from 1. */
export function checkSources(script: string, steps: Step[]): string[] {
  return steps.flatMap((step, i) => (step.source ? [] : [`${script} step ${i + 1}: missing source`]));
}

/** Returns one error line per load step whose file is not in `.bench/tools/<tool>@<pin>/`. */
export function checkLoads(root: string, pins: Pins, script: string, steps: Step[]): string[] {
  return steps.flatMap((step, i) => {
    if (step.kind !== "load") return [];
    const error = loadError(root, pins, step);
    return error ? [`${script} step ${i + 1}: ${error}`] : [];
  });
}

function loadError(root: string, pins: Pins, step: Step): string | undefined {
  if (!step.tool) return "load step missing tool";
  if (!step.path) return "load step missing path";
  if (!Object.hasOwn(pins, step.tool)) return `tool ${step.tool} is not pinned`;
  const install = `${step.tool}@${pins[step.tool]}`;
  const dir = join(root, ".bench", "tools", install);
  const rel = relative(dir, resolve(dir, step.path));
  if (isAbsolute(step.path) || rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) {
    return `${step.path} is outside ${install}`;
  }
  if (!statSync(join(dir, rel), { throwIfNoEntry: false })?.isFile()) return `${step.path} not found in ${install}`;
  return undefined;
}
