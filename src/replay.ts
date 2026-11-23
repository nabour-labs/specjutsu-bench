import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Pins } from "./pins.ts";
import { WORKFLOWS, loadSessionSteps, loadSteps, type Step } from "./steps.ts";

export type StepResult = { kind: Step["kind"]; path?: string; command?: string; context: number; output: number };
export type ScriptResult = { context: number; output: number; steps: StepResult[] };
export type Results = { pins: Pins; workflows: Record<string, Record<string, ScriptResult>> };

/** Runs every workflow's script for every task and counts the bytes each step costs. */
export function replayAll(root: string, pins: Pins, tasks: string[]): Results {
  const workflows: Results["workflows"] = {};
  for (const workflow of WORKFLOWS) {
    workflows[workflow] = {};
    const sessionStart = loadSessionSteps(root, workflow)
      .filter((step) => step.kind === "load")
      .reduce((sum, step) => sum + loadBytes(root, pins, step), 0);
    for (const task of tasks) {
      const steps = loadSteps(root, `steps/${workflow}/${task}.yaml`);
      workflows[workflow][task] = replayScript(root, pins, task, sessionStart, steps);
    }
  }
  return { pins, workflows };
}

/** Runs one script in a fresh copy of `fixture/start/`, removed afterwards. */
function replayScript(root: string, pins: Pins, task: string, sessionStart: number, steps: Step[]): ScriptResult {
  const workspace = mkdtempSync(join(tmpdir(), "replay-workspace-"));
  try {
    cpSync(join(root, "fixture", "start"), workspace, { recursive: true });
    const results = steps.map((step) => ({ ...label(step), ...count(root, pins, task, sessionStart, workspace, step) }));
    return {
      context: results.reduce((sum, step) => sum + step.context, 0),
      output: results.reduce((sum, step) => sum + step.output, 0),
      steps: results,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function label(step: Step): Pick<StepResult, "kind" | "path" | "command"> {
  return { kind: step.kind, ...(step.path ? { path: step.path } : {}), ...(step.command ? { command: step.command } : {}) };
}

function loadBytes(root: string, pins: Pins, step: Step): number {
  return statSync(join(root, ".bench", "tools", `${step.tool}@${pins[step.tool!]}`, step.path!)).size;
}

function count(
  root: string,
  pins: Pins,
  task: string,
  sessionStart: number,
  workspace: string,
  step: Step,
): { context: number; output: number } {
  switch (step.kind) {
    case "load":
      return { context: loadBytes(root, pins, step), output: 0 };
    case "read":
      return { context: statSync(join(workspace, step.path!)).size, output: 0 };
    case "run": {
      const run = spawnSync(step.command!, { cwd: workspace, shell: true });
      return { context: run.stdout.length + run.stderr.length, output: 0 };
    }
    case "write": {
      const target = join(workspace, step.path!);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(root, "fixture", "golden", task, step.path!), target);
      return { context: 0, output: statSync(target).size };
    }
    case "session":
      return { context: sessionStart, output: 0 };
  }
}
