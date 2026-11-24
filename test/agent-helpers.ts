import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
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

/** A setup script with one sourced command that does nothing. */
export const SETUP_SCRIPT = `steps:\n  - command: "true"\n    source: https://example.com/docs#setup\n`;

/**
 * A fake `claude`: it appends one JSON line per call to `calls.jsonl` beside itself, holding its
 * argv, working directory, the session id it answers with (`session-<n>` for the n-th call) and
 * what it sees of `CLAUDE_CONFIG_DIR`; then it prints stream-json with that session id.
 */
const FAKE_CLAUDE = `#!/usr/bin/env node
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const log = join(dir, "calls.jsonl");
const n = existsSync(log) ? readFileSync(log, "utf8").split("\\n").filter(Boolean).length + 1 : 1;
const sessionId = "session-" + n;
const configDir = process.env.CLAUDE_CONFIG_DIR;
const config = configDir === undefined ? undefined : { path: configDir, entries: existsSync(configDir) ? readdirSync(configDir) : null };
appendFileSync(log, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), sessionId, config }) + "\\n");
const usage = { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 10 };
for (const line of [
  { type: "system", subtype: "init", session_id: sessionId },
  { type: "assistant", session_id: sessionId, message: { role: "assistant", content: [{ type: "text", text: "ok" }], usage } },
  { type: "result", subtype: "success", is_error: false, session_id: sessionId, total_cost_usd: 0.01, usage },
]) console.log(JSON.stringify(line));
`;

export type FakeCall = {
  argv: string[];
  cwd: string;
  sessionId: string;
  config?: { path: string; entries: string[] | null };
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
