import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { WORKFLOWS } from "../src/steps.ts";
import { benchRoot, TASKS } from "./helpers.ts";

/** A prompt script with `count` prompts that each cite a source. */
export function promptScript(count: number): string {
  const prompts = Array.from({ length: count }, (_, i) =>
    `  - prompt: "prompt ${i + 1}"\n    source: https://example.com/docs#prompt-${i + 1}\n`,
  );
  return `prompts:\n${prompts.join("")}`;
}

/** A prompt script sending `prompts` in order, each citing a source. */
export function promptsYaml(prompts: string[]): string {
  return `prompts:\n${prompts.map((prompt, i) => `  - prompt: ${JSON.stringify(prompt)}\n    source: https://example.com/docs#p-${i + 1}\n`).join("")}`;
}

/** A setup script with one sourced command that does nothing. */
export const SETUP_SCRIPT = `steps:\n  - command: "true"\n    source: https://example.com/docs#setup\n`;

/**
 * A fake `claude`: it appends one JSON line per call to `calls.jsonl` beside itself, holding its
 * argv, working directory, the session id it answers with (`session-<n>` for the n-th call) and
 * what it sees of `CLAUDE_CONFIG_DIR` and `ANTHROPIC_API_KEY`, and the subjects `git log main` prints
 * in its working directory (null when git fails); then it prints stream-json with that session id.
 *
 * What it does for a prompt is set per test in `behaviour.json` beside it (see `FakeBehaviour`):
 * the n-th call with a given prompt text follows the n-th behaviour listed for that text, and a
 * call without one answers with one turn of 100 input and 10 output tokens.
 */
const FAKE_CLAUDE = `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const log = join(dir, "calls.jsonl");
const previous = existsSync(log) ? readFileSync(log, "utf8").split("\\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
const n = previous.length + 1;
const argv = process.argv.slice(2);
const prompt = argv[argv.indexOf("-p") + 1];
const behaviours = existsSync(join(dir, "behaviour.json")) ? JSON.parse(readFileSync(join(dir, "behaviour.json"), "utf8")) : {};
const behaviour = (behaviours[prompt] ?? [])[previous.filter((call) => call.argv[argv.indexOf("-p") + 1] === prompt).length] ?? {};
const sessionId = "session-" + n;
const configDir = process.env.CLAUDE_CONFIG_DIR;
const config = configDir === undefined ? undefined : { path: configDir, entries: existsSync(configDir) ? readdirSync(configDir) : null };
const apiKey = process.env.ANTHROPIC_API_KEY;
const git = spawnSync("git", ["log", "--format=%s", "main"], { encoding: "utf8" });
const gitLog = git.status === 0 ? git.stdout.split("\\n").filter(Boolean) : null;
appendFileSync(log, JSON.stringify({ argv, cwd: process.cwd(), sessionId, config, apiKey, gitLog }) + "\\n");
if (behaviour.sleep) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, behaviour.sleep * 1000);
const turns = behaviour.turns ?? [{ input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 10 }];
// The result message's usage is the call's total, as Claude Code reports it.
const total = {};
for (const turn of turns) for (const [key, value] of Object.entries(turn)) total[key] = (total[key] ?? 0) + value;
const lines = [{ type: "system", subtype: "init", session_id: sessionId }];
for (const usage of turns) lines.push({ type: "assistant", session_id: sessionId, message: { role: "assistant", content: [{ type: "text", text: "ok" }], usage } });
if (!behaviour.noResult) lines.push({ type: "result", subtype: "success", is_error: false, session_id: sessionId, total_cost_usd: behaviour.cost ?? 0.01, usage: total });
for (const line of lines) console.log(JSON.stringify(line));
process.exitCode = behaviour.exit ?? 0;
`;

/** Usage as one assistant turn of Claude Code's stream-json reports it. */
export type TurnUsage = {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
};

/**
 * What the fake `claude` does for one call: the turns it reports (default one of 100 in, 10 out)
 * and the cost; the seconds it sleeps first, whether it leaves out the result message, and the
 * code it exits with after printing.
 */
export type FakeBehaviour = { turns?: TurnUsage[]; cost?: number; sleep?: number; noResult?: boolean; exit?: number };

/** Sets what the fake `claude` in `root` does for each prompt text: the n-th call with that text follows the n-th entry. */
export function fakeBehaviour(root: string, byPrompt: Record<string, FakeBehaviour[]>): void {
  writeFileSync(join(root, "fake-claude", "behaviour.json"), JSON.stringify(byPrompt));
}

export type FakeCall = {
  argv: string[];
  cwd: string;
  sessionId: string;
  config?: { path: string; entries: string[] | null };
  apiKey?: string;
  gitLog: string[] | null;
};

/** The calls the fake `claude` in `root` recorded, in order. */
export function fakeCalls(root: string): FakeCall[] {
  const log = join(root, "fake-claude", "calls.jsonl");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as FakeCall);
}

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
  all["fake-claude/claude"] = FAKE_CLAUDE;
  const root = benchRoot({ ...all, ...files });
  chmodSync(join(root, "fake-claude", "claude"), 0o755);
  return root;
}

/** Runs `npm run agents` in `root`, with its fake `claude` first on PATH and `env` added. */
export function agents(root: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  const PATH = `${join(root, "fake-claude")}${delimiter}${process.env.PATH ?? ""}`;
  return spawnSync("npm", ["run", "--silent", "agents", "--", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH, ...env },
  });
}
