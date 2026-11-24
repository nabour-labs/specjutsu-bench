import { spawnSync } from "node:child_process";
import { WORKFLOWS } from "../src/steps.ts";
import { benchRoot, TASKS } from "./helpers.ts";

/** A prompt script with `count` prompts that each cite a source. */
export function promptScript(count: number): string {
  const prompts = Array.from({ length: count }, (_, i) =>
    `  - prompt: "prompt ${i + 1}"\n    source: https://example.com/docs#prompt-${i + 1}\n`,
  );
  return `prompts:\n${prompts.join("")}`;
}

/** A setup script with one sourced command that does nothing. */
export const SETUP_SCRIPT = `steps:\n  - command: "true"\n    source: https://example.com/docs#setup\n`;

/**
 * A throwaway benchmark root (see `benchRoot`) that also passes every agent check: the pinned
 * model, and a setup script and a prompt script per task for every workflow. `files` adds or
 * replaces files by relative path; a null value leaves that file out.
 */
export function agentRoot(files: Record<string, string | null> = {}): string {
  const all: Record<string, string | null> = { "agents/agents.json": JSON.stringify({ model: "claude-sonnet-5-5" }) };
  for (const workflow of WORKFLOWS) {
    all[`agents/${workflow}/setup.yaml`] = SETUP_SCRIPT;
    for (const task of TASKS) all[`agents/${workflow}/${task}.yaml`] = promptScript(1);
  }
  return benchRoot({ ...all, ...files });
}

/** Runs `npm run agents` in `root`. */
export function agents(root: string, args: string[] = []) {
  return spawnSync("npm", ["run", "--silent", "agents", "--", ...args], { cwd: root, encoding: "utf8" });
}
