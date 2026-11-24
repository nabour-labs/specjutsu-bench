import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowlistedEnv } from "../fixture.ts";
import { commitStart, copyStart, linkExcludedNodeModules } from "../replay.ts";
import { WORKFLOWS } from "../steps.ts";
import { loadAgentConfig, loadPrompts, loadSetup } from "./scripts.ts";

/** One `claude -p` call: its arguments, the session id its stream-json named, and the raw stream lines. */
export type Call = { argv: string[]; sessionId?: string; lines: string[]; status: number | null };
export type Run = { calls: Call[] };
export type Runs = Record<string, Record<string, Run>>;

/** Thrown when a setup command fails; the benchmark stops and writes no results. */
export class SetupError extends Error {}

/** The most a call may print, so its stream-json is read in full. */
const CALL_MAX_BUFFER = 256 * 1024 * 1024;

/** Runs every workflow's prompt script for every task, once each. */
export function runAll(root: string, tasks: string[]): Runs {
  const { model } = loadAgentConfig(root);
  const runs: Runs = {};
  for (const workflow of WORKFLOWS) {
    runs[workflow] = {};
    for (const task of tasks) runs[workflow][task] = runAgent(root, model, workflow, task);
  }
  return runs;
}

/** One run of a workflow's prompt script for a task, in a fresh copy of `fixture/start/` removed afterwards. */
export function runAgent(root: string, model: string, workflow: string, task: string): Run {
  // The run's temporary area holds its workspace and its Claude Code configuration.
  const area = realpathSync(mkdtempSync(join(tmpdir(), "agent-run-")));
  try {
    const workspace = join(area, "workspace");
    mkdirSync(workspace);
    // The workspace is a git repo with the start state committed, as a user's checkout would be.
    copyStart(root, workspace);
    commitStart(workspace);
    linkExcludedNodeModules(root, workspace);
    const env = runEnv(join(area, "claude-config"));
    setUp(root, workflow, workspace, env);
    // Only `claude` needs the API key; setup commands run third-party installers.
    if (process.env.ANTHROPIC_API_KEY !== undefined) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const calls: Call[] = [];
    // A prompt resumes the previous call's session unless a `session` entry came since.
    let resume: string | undefined;
    for (const entry of loadPrompts(root, workflow, task)) {
      if (entry.session) {
        resume = undefined;
        continue;
      }
      const argv = ["-p", entry.prompt ?? "", "--output-format", "stream-json", "--verbose", "--model", model];
      argv.push("--permission-mode", "bypassPermissions");
      if (resume) argv.push("--resume", resume);
      const call = spawnSync("claude", argv, { cwd: workspace, env, encoding: "utf8", maxBuffer: CALL_MAX_BUFFER });
      const lines = (call.stdout ?? "").split("\n").filter((line) => line.trim() !== "");
      const sessionId = lastSessionId(lines);
      calls.push({ argv, sessionId, lines, status: call.status });
      resume = sessionId;
    }
    return { calls };
  } finally {
    rmSync(area, { recursive: true, force: true });
  }
}

/** Runs the workflow's setup commands in the workspace; their output isn't counted. */
function setUp(root: string, workflow: string, workspace: string, env: NodeJS.ProcessEnv): void {
  loadSetup(root, workflow).forEach((step, i) => {
    const run = spawnSync(step.command ?? "", { cwd: workspace, shell: true, env, stdio: "ignore" });
    if (run.status !== 0) {
      const how = run.error ? `failed: ${run.error.message}` : `exited ${run.status ?? run.signal}`;
      throw new SetupError(`${workflow} setup step ${i + 1}: ${how}`);
    }
  });
}

/**
 * The environment for a run's setup commands and calls: the allowlisted variables (`PATH`, which
 * finds `claude`, `HOME`, `TMPDIR`) and `CLAUDE_CONFIG_DIR` as `configDir`, created empty, so the
 * machine's Claude Code settings, memory and plugins never enter the run.
 */
function runEnv(configDir: string): NodeJS.ProcessEnv {
  mkdirSync(configDir);
  const env = allowlistedEnv();
  env.CLAUDE_CONFIG_DIR = configDir;
  return env;
}

/** The last `session_id` a call's stream-json names, or undefined when none does. */
function lastSessionId(lines: string[]): string | undefined {
  let id: string | undefined;
  for (const line of lines) {
    try {
      const message = JSON.parse(line) as { session_id?: unknown };
      if (typeof message.session_id === "string") id = message.session_id;
    } catch {
      // A line that isn't JSON names no session.
    }
  }
  return id;
}
