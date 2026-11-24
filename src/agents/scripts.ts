import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { checkPins, type Pins } from "../pins.ts";
import { WORKFLOWS, citationError } from "../steps.ts";

/** A command run in the workspace before the first prompt. */
export type SetupStep = { command?: string; source?: string; note?: string };
/** A prompt sent to `claude -p`, or a `session` entry that makes the next prompt start a new session. */
export type PromptEntry = { prompt?: string; session?: boolean; source?: string; note?: string };
export type AgentConfig = { model: string };

export const AGENTS_JSON = "agents/agents.json";

export function setupScript(workflow: string): string {
  return `agents/${workflow}/setup.yaml`;
}

export function promptScript(workflow: string, task: string): string {
  return `agents/${workflow}/${task}.yaml`;
}

export function loadSetup(root: string, workflow: string): SetupStep[] {
  return (parse(readFileSync(join(root, setupScript(workflow)), "utf8")) as { steps: SetupStep[] }).steps;
}

export function loadPrompts(root: string, workflow: string, task: string): PromptEntry[] {
  return (parse(readFileSync(join(root, promptScript(workflow, task)), "utf8")) as { prompts: PromptEntry[] }).prompts;
}

export function loadAgentConfig(root: string): AgentConfig {
  return JSON.parse(readFileSync(join(root, AGENTS_JSON), "utf8")) as AgentConfig;
}

/** Each prompt entry as messages name it: `prompt <n>` or `session <n>`, counted per kind from 1. */
function promptLabels(entries: PromptEntry[]): string[] {
  const counts = { prompt: 0, session: 0 };
  return entries.map((entry) => {
    const kind = entry.session ? "session" : "prompt";
    return `${kind} ${++counts[kind]}`;
  });
}

/** One error line per entry without a source or whose source is not a valid citation. */
function sourceErrors(root: string, pins: Pins, script: string, entries: { source?: string }[], labels: string[]): string[] {
  return entries.flatMap((entry, i) => {
    const at = `${script} ${labels[i]}`;
    if (!entry.source) return [`${at}: missing source`];
    const error = citationError(root, pins, entry.source);
    return error ? [`${at}: ${error}`] : [];
  });
}

/**
 * Every problem with the agent scripts, one line each: the pinned model, a setup script per
 * workflow and a prompt script per workflow per task, each entry citing a valid source.
 */
export function checkAgentScripts(root: string, pins: Pins, tasks: string[]): string[] {
  const errors = checkPins(pins);
  if (!existsSync(join(root, AGENTS_JSON))) errors.push(`missing ${AGENTS_JSON}`);
  else if (typeof (loadAgentConfig(root) as Partial<AgentConfig>).model !== "string") {
    errors.push(`${AGENTS_JSON}: missing model`);
  }
  for (const workflow of WORKFLOWS) {
    const setup = setupScript(workflow);
    if (!existsSync(join(root, setup))) errors.push(`missing ${setup}`);
    else {
      const steps = loadSetup(root, workflow);
      errors.push(...sourceErrors(root, pins, setup, steps, steps.map((_, i) => `setup step ${i + 1}`)));
    }
    for (const task of tasks) {
      const script = promptScript(workflow, task);
      if (!existsSync(join(root, script))) errors.push(`missing ${script}`);
      else {
        const entries = loadPrompts(root, workflow, task);
        errors.push(...sourceErrors(root, pins, script, entries, promptLabels(entries)));
      }
    }
  }
  return errors;
}
