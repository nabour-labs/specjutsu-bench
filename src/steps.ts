import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
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

/** `<tool>@<pin>:<path>`, optionally ending `#L<a>` or `#L<a>-L<b>`. */
const PINNED_SOURCE = /^([^@:\s]+)@([^:\s]+):([^#\s]+)(#L(\d+)(?:-L(\d+))?)?$/;

/**
 * Returns one error line per step whose source is neither `<tool>@<pin>:<path>` nor an
 * `https://` URL, cites a tool that is not pinned or not at its pin, names a path that is not a
 * file in that tool's pinned install, or a line range that is not one or runs past the file's
 * end. Steps with no source are left to `checkSources`.
 */
export function checkCitations(root: string, pins: Pins, script: string, steps: Step[]): string[] {
  return steps.flatMap((step, i) => {
    if (!step.source) return [];
    const error = citationError(root, pins, step.source);
    return error ? [`${script} step ${i + 1}: ${error}`] : [];
  });
}

/**
 * Why `source` is not a valid citation (see `checkCitations`), or undefined when it is; the error
 * starts after the `<script> step <n>: ` prefix.
 */
export function citationError(root: string, pins: Pins, source: string): string | undefined {
  if (source.startsWith("https://")) return undefined;
  const match = PINNED_SOURCE.exec(source);
  if (!match) return `source "${source}" is not <tool>@<pin>:<path> or an https:// URL`;
  const [, tool, pin, path, range, from, to] = match;
  if (!Object.hasOwn(pins, tool)) return `source cites ${tool}, which is not pinned`;
  if (pins[tool] !== pin) return `source cites ${tool}@${pin}, but ${tool} is pinned to ${pins[tool]}`;
  const install = `${tool}@${pin}`;
  const file = pinnedFile(root, install, path);
  if (typeof file !== "string") return `source ${file.error}`;
  if (!range) return undefined;
  const first = Number(from);
  const last = Number(to ?? from);
  if (first < 1 || last < first) return `source ${path}${range}: not a valid line range`;
  const lines = readFileSync(file, "utf8").split("\n");
  const count = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  return last > count ? `source ${path}${range}: the file has ${count} lines` : undefined;
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
  const file = pinnedFile(root, `${step.tool}@${pins[step.tool]}`, step.path);
  return typeof file === "string" ? undefined : file.error;
}

/**
 * The absolute path of `path` inside `.bench/tools/<install>/`, or an error when the path leaves
 * that install or is not a file there.
 */
function pinnedFile(root: string, install: string, path: string): string | { error: string } {
  const dir = join(root, ".bench", "tools", install);
  const rel = inside(dir, path);
  if (rel === undefined) return { error: `${path} is outside ${install}` };
  const file = join(dir, rel);
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return { error: `${path} not found in ${install}` };
  return file;
}

/** `path` relative to `dir`, or undefined when it is absolute, `dir` itself or leaves `dir`. */
function inside(dir: string, path: string): string | undefined {
  const rel = relative(dir, resolve(dir, path));
  return isAbsolute(path) || rel === "" || rel === ".." || rel.startsWith(`..${sep}`) ? undefined : rel;
}

/** Stands in for a replay's workspace, which exists only while its script runs. */
const WORKSPACE = resolve(sep, "workspace");

/**
 * Returns one error line per read or write step without a path or whose path leaves the
 * workspace, and per write step whose golden file, `fixture/golden/<task>/<path>`, is not a file;
 * the task is the script's file name.
 */
export function checkPaths(root: string, script: string, steps: Step[]): string[] {
  const golden = `fixture/golden/${basename(script, ".yaml")}`;
  return steps.flatMap((step, i) => {
    if (step.kind !== "read" && step.kind !== "write") return [];
    const at = `${script} step ${i + 1}`;
    if (step.path === undefined) return [`${at}: ${step.kind} step missing path`];
    const rel = inside(WORKSPACE, step.path);
    if (rel === undefined) return [`${at}: ${step.path} is outside the workspace`];
    if (step.kind === "write" && !statSync(join(root, golden, rel), { throwIfNoEntry: false })?.isFile()) {
      return [`${at}: ${step.path} not found in ${golden}`];
    }
    return [];
  });
}

/**
 * Returns one error line per run step calling `sj` when specjutsu is not pinned or its pinned
 * `bin/sj` is not installed, so the replay never falls back to an `sj` on PATH.
 */
export function checkSjRuns(root: string, pins: Pins, script: string, steps: Step[]): string[] {
  return steps.flatMap((step, i) => {
    if (step.kind !== "run" || !/^sj\b/.test(step.command ?? "")) return [];
    if (!Object.hasOwn(pins, "specjutsu")) return [`${script} step ${i + 1}: tool specjutsu is not pinned`];
    const install = `specjutsu@${pins.specjutsu}`;
    const sj = `.bench/tools/${install}/bin/sj`;
    return existsSync(join(root, sj)) ? [] : [`${script} step ${i + 1}: ${install} is not installed: ${sj}`];
  });
}
