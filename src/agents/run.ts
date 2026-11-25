import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowlistedEnv } from "../fixture.ts";
import { commitStart, copyStart, linkExcludedNodeModules } from "../replay.ts";
import { WORKFLOWS } from "../steps.ts";
import { loadAgentConfig, loadPrompts, loadSetup } from "./scripts.ts";
import { addUsage, NO_USAGE, parseCall, type Usage } from "./usage.ts";

/**
 * One run of one workflow and task: whether it passed, why not when it failed, and its usage
 * summed over every call it made.
 */
export type Run = { outcome: "passed" | "failed"; reason?: string } & Usage;
/** How many runs each workflow and task gets, and the seconds a call may take before the run fails. */
export type RunOptions = { runs: number; timeout: number };
/** Every run, by workflow and task, in the order they ran. */
export type Runs = Record<string, Record<string, Run[]>>;

/** Thrown when a setup command fails; the benchmark stops and writes no results. */
export class SetupError extends Error {}

/** The most a call may print, so its stream-json is read in full. */
const CALL_MAX_BUFFER = 256 * 1024 * 1024;

/** Where a run's call transcripts go: outside `results/`, for CI to keep as an artifact. */
export const TRANSCRIPTS = ".bench/transcripts";

/** Runs every workflow's prompt script for every task, `options.runs` times each; earlier transcripts are cleared first. */
export function runAll(root: string, tasks: string[], options: RunOptions): Runs {
  const { model } = loadAgentConfig(root);
  rmSync(join(root, TRANSCRIPTS), { recursive: true, force: true });
  const runs: Runs = {};
  for (const workflow of WORKFLOWS) {
    runs[workflow] = {};
    for (const task of tasks) {
      runs[workflow][task] = [];
      for (let n = 1; n <= options.runs; n++) {
        runs[workflow][task].push(runAgent(root, model, workflow, task, n, options.timeout));
      }
    }
  }
  return runs;
}

/**
 * The `n`-th run of a workflow's prompt script for a task, in a fresh copy of `fixture/start/`
 * removed afterwards. Each call's stream-json is saved as
 * `.bench/transcripts/<workflow>/<task>/run-<n>/prompt-<k>.jsonl`, `k` counting prompts from 1.
 * A call that exits non-zero, prints no result message or runs past `timeout` seconds fails the
 * run, and the run makes no more calls.
 */
export function runAgent(root: string, model: string, workflow: string, task: string, n: number, timeout: number): Run {
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
    const transcripts = join(root, TRANSCRIPTS, workflow, task, `run-${n}`);
    mkdirSync(transcripts, { recursive: true });
    let usage = NO_USAGE;
    let k = 0;
    // A prompt resumes the previous call's session unless a `session` entry came since.
    let resume: string | undefined;
    for (const entry of loadPrompts(root, workflow, task)) {
      if (entry.session) {
        resume = undefined;
        continue;
      }
      k++;
      const argv = ["-p", entry.prompt ?? "", "--output-format", "stream-json", "--verbose", "--model", model];
      argv.push("--permission-mode", "bypassPermissions");
      if (resume) argv.push("--resume", resume);
      const call = spawnSync("claude", argv, {
        cwd: workspace,
        env,
        encoding: "utf8",
        maxBuffer: CALL_MAX_BUFFER,
        timeout: timeout * 1000,
      });
      const stdout = call.stdout ?? "";
      writeFileSync(join(transcripts, `prompt-${k}.jsonl`), stdout);
      const stream = parseCall(stdout.split("\n").filter((line) => line.trim() !== ""));
      usage = addUsage(usage, stream.usage);
      resume = stream.sessionId;
      const failure =
        (call.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT"
          ? `claude timed out after ${timeout}s`
          : call.status !== 0
            ? `claude exited ${call.status}`
            : !stream.result
              ? "no result message"
              : undefined;
      if (failure) return { outcome: "failed", reason: `prompt ${k}: ${failure}`, ...usage };
    }
    return { outcome: "passed", ...usage };
  } finally {
    rmSync(area, { recursive: true, force: true });
  }
}

/** Runs the workflow's setup commands in the workspace; their output isn't counted. */
function setUp(root: string, workflow: string, workspace: string, env: NodeJS.ProcessEnv): void {
  loadSetup(root, workflow).forEach((step, i) => {
    const run = spawnSync(step.command ?? "", { cwd: workspace, shell: true, env, stdio: "ignore" });
    if (run.status !== 0) {
      const how = run.error
        ? `failed: ${run.error.message}`
        : run.status === null
          ? `killed by ${run.signal}`
          : `exited ${run.status}`;
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
