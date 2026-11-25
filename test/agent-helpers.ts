import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKFLOWS } from "../src/steps.ts";
import { benchRoot, type Finished, spawnAsync, TASKS } from "./helpers.ts";

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
 * in its working directory (null when git fails), its `HOME` and what a `hello` on PATH prints;
 * then it prints stream-json with that session id.
 *
 * What it does for a prompt is set per test in `behaviour.json` beside it (see `FakeBehaviour`):
 * the n-th call with a given prompt text follows the n-th behaviour listed for that text, and a
 * call without one answers with one turn of 100 input and 10 output tokens and edits nothing.
 */
const FAKE_CLAUDE = `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
const home = process.env.HOME;
const hello = spawnSync("hello", [], { encoding: "utf8" });
const helloOutput = hello.status === 0 ? hello.stdout : null;
const git = spawnSync("git", ["log", "--format=%s", "main"], { encoding: "utf8" });
const gitLog = git.status === 0 ? git.stdout.split("\\n").filter(Boolean) : null;
let commit;
if (behaviour.commit) {
  const made = spawnSync("git", ["commit", "--allow-empty", "-m", "work"], { encoding: "utf8" });
  const author = spawnSync("git", ["log", "-1", "--format=%an <%ae>"], { encoding: "utf8" });
  commit = { status: made.status, author: author.stdout.trim() };
}
const looked = behaviour.look === undefined ? undefined : existsSync(join(process.cwd(), behaviour.look));
appendFileSync(log, JSON.stringify({ argv, cwd: process.cwd(), sessionId, config, apiKey, gitLog, home, helloOutput, looked, commit }) + "\\n");
if (behaviour.sleep) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, behaviour.sleep * 1000);
if (behaviour.copy) cpSync(behaviour.copy.from, join(process.cwd(), behaviour.copy.to), { recursive: true });
if (behaviour.write) writeFileSync(join(process.cwd(), behaviour.write), "written by the agent\\n");
const turns = behaviour.turns ?? [{ input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 10 }];
// The result message's usage is the call's total, as Claude Code reports it.
const total = {};
for (const { id, parent, ...usage } of turns) for (const [key, value] of Object.entries(usage)) total[key] = (total[key] ?? 0) + value;
const lines = [{ type: "system", subtype: "init", session_id: sessionId }];
// Each turn is its own message unless the behaviour gives turns the same id.
turns.forEach(({ id, parent, ...usage }, i) => {
  const message = { id: id ?? "msg-" + n + "-" + (i + 1), role: "assistant", content: [{ type: "text", text: "ok" }], usage };
  lines.push({ type: "assistant", session_id: sessionId, parent_tool_use_id: parent ?? null, message });
});
if (!behaviour.noResult) lines.push({ type: "result", subtype: "success", is_error: false, session_id: sessionId, total_cost_usd: behaviour.cost ?? 0.01, usage: total });
for (const line of lines) console.log(JSON.stringify(line));
process.exitCode = behaviour.exit ?? 0;
`;

/**
 * Usage as one assistant line of Claude Code's stream-json reports it, and the line's `message.id`
 * (by default a new one per line, so each line is its own turn).
 */
export type TurnUsage = {
  id?: string;
  /** The `parent_tool_use_id` of a subagent's line; the agent's own lines have none. */
  parent?: string;
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
export type FakeBehaviour = {
  turns?: TurnUsage[];
  cost?: number;
  sleep?: number;
  noResult?: boolean;
  exit?: number;
  /** A directory copied over `to`, relative to the call's working directory, as the agent's edits. */
  copy?: { from: string; to: string };
  /** A file the call writes, relative to its working directory. */
  write?: string;
  /** A file the call looks for, relative to its working directory; whether it was there is recorded as `looked`. */
  look?: string;
  /** Whether the call runs `git commit --allow-empty -m work`; how it went is recorded as `commit`. */
  commit?: boolean;
};

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
  home?: string;
  /** What a `hello` command on PATH printed, or null when there was none. */
  helloOutput: string | null;
  /** Whether the behaviour's `look` file was there, when the behaviour names one. */
  looked?: boolean;
  /** How `git commit --allow-empty -m work` exited and the new HEAD's `%an <%ae>`, when the behaviour commits. */
  commit?: { status: number | null; author: string };
};

/** The calls the fake `claude` in `root` recorded, in order. */
export function fakeCalls(root: string): FakeCall[] {
  const log = join(root, "fake-claude", "calls.jsonl");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as FakeCall);
}

const pkg = fileURLToPath(new URL("..", import.meta.url));

/**
 * This package's real fixture for one task, as `agentRoot` files: `fixture/start/`, the task's
 * golden end state and a `fixture/tasks.json` listing only that task, with the real test command.
 */
export function realFixture(task: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const dir of ["fixture/start", `fixture/golden/${task}`]) {
    for (const entry of readdirSync(join(pkg, dir), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = join(entry.parentPath, entry.name);
      files[relative(pkg, path)] = readFileSync(path, "utf8");
    }
  }
  const { test } = JSON.parse(readFileSync(join(pkg, "fixture", "tasks.json"), "utf8")) as { test: string };
  files["fixture/tasks.json"] = JSON.stringify({ tasks: [task], test });
  return files;
}

/**
 * A throwaway benchmark root (see `benchRoot`) that also passes every agent check: the pinned
 * model, a setup script and a prompt script per task for every workflow, and a golden `test/`
 * dir per task. `files` adds or replaces files by relative path; a null value leaves that file out.
 */
export function agentRoot(files: Record<string, string | null> = {}): string {
  const all: Record<string, string | null> = { "agents/agents.json": JSON.stringify({ model: "claude-sonnet-5-5" }) };
  for (const workflow of WORKFLOWS) {
    all[`agents/${workflow}/setup.yaml`] = SETUP_SCRIPT;
    for (const task of TASKS) all[`agents/${workflow}/${task}.yaml`] = promptScript(1);
  }
  // Every task needs golden tests; these copy in a note and leave the fixture's suite as it is.
  for (const task of TASKS) all[`fixture/golden/${task}/test/README.md`] = "golden tests\n";
  all["fake-claude/claude"] = FAKE_CLAUDE;
  const root = benchRoot({ ...all, ...files });
  chmodSync(join(root, "fake-claude", "claude"), 0o755);
  return root;
}

/** Runs `npm run agents` in `root`, with its fake `claude` first on PATH and `env` added. */
export function agents(root: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): Promise<Finished> {
  const PATH = `${join(root, "fake-claude")}${delimiter}${process.env.PATH ?? ""}`;
  return spawnAsync("npm", ["run", "--silent", "agents", "--", ...args], { cwd: root, env: { ...process.env, PATH, ...env } });
}
