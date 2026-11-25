import { spawnSync } from "node:child_process";
import { accessSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, sep } from "node:path";
import { allowlistedEnv, loadTestCommand, SUITE_TIMEOUT_MS } from "../fixture.ts";
import { BENCH_GIT_IDENTITY, commitStart, copyStart, excludeNodeModules } from "../replay.ts";
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

/**
 * Runs every workflow's prompt script for every task, `options.runs` times each, skipping the runs
 * `saved` says are already saved, and hands each run to `finished` as soon as it is done.
 */
export function runAll(
  root: string,
  tasks: string[],
  options: RunOptions,
  saved: (workflow: string, task: string, n: number) => boolean,
  finished: (workflow: string, task: string, n: number, run: Run) => void,
): void {
  const { model } = loadAgentConfig(root);
  for (const workflow of WORKFLOWS) {
    for (const task of tasks) {
      for (let n = 1; n <= options.runs; n++) {
        if (!saved(workflow, task, n)) finished(workflow, task, n, runAgent(root, model, workflow, task, n, options.timeout));
      }
    }
  }
}

/**
 * The `n`-th run of a workflow's prompt script for a task, in a fresh copy of `fixture/start/`
 * removed afterwards. The run's earlier transcripts are cleared when it starts. Each call's
 * stream-json, with the API key redacted, is saved as
 * `.bench/transcripts/<workflow>/<task>/run-<n>/prompt-<k>.jsonl`, `k` counting prompts from 1.
 * A call that exits non-zero, prints no result message or runs past `timeout` seconds fails the
 * run, and the run makes no more calls. After the last prompt, the task's golden tests decide
 * whether the run passed.
 */
export function runAgent(root: string, model: string, workflow: string, task: string, n: number, timeout: number): Run {
  const transcripts = join(root, TRANSCRIPTS, workflow, task, `run-${n}`);
  rmSync(transcripts, { recursive: true, force: true });
  // The run's temporary area holds its workspace and its Claude Code configuration.
  const area = realpathSync(mkdtempSync(join(tmpdir(), "agent-run-")));
  try {
    const workspace = join(area, "workspace");
    mkdirSync(workspace);
    // The workspace is a git repo with the start state committed, as a user's checkout would be.
    copyStart(root, workspace);
    commitStart(workspace);
    copyNodeModules(root, workspace);
    const env = runEnv(join(area, "claude-config"), join(area, "home"));
    setUp(root, workflow, workspace, env);
    // Only `claude` needs the API key; setup commands run third-party installers.
    if (process.env.ANTHROPIC_API_KEY !== undefined) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
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
        // A killed claude's children may hold its stdout open; SIGKILL ends the call regardless.
        killSignal: "SIGKILL",
      });
      const stdout = call.stdout ?? "";
      writeFileSync(join(transcripts, `prompt-${k}.jsonl`), redactKey(stdout));
      const stream = parseCall(stdout.split("\n").filter((line) => line.trim() !== ""));
      usage = addUsage(usage, stream.usage);
      resume = stream.sessionId;
      const failure =
        (call.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT"
          ? `claude timed out after ${timeout}s`
          : call.status === null
            ? `claude killed by ${call.signal}`
            : call.status !== 0
              ? `claude exited ${call.status}`
              : !stream.result
                ? "no result message"
                : undefined;
      if (failure) return { outcome: "failed", reason: `prompt ${k}: ${failure}`, ...usage };
    }
    if (!acceptancePasses(root, task, workspace)) return { outcome: "failed", reason: "acceptance tests failed", ...usage };
    return { outcome: "passed", ...usage };
  } finally {
    rmSync(area, { recursive: true, force: true });
  }
}

/**
 * Copies the bench's `node_modules` into a committed workspace, excluded from git, so what a run
 * changes there stays in that run. Links inside it are kept as they are (`.bin`'s are relative),
 * and files are cloned where the file system can.
 */
function copyNodeModules(root: string, workspace: string): void {
  const modules = join(root, "node_modules");
  if (!existsSync(modules)) return;
  const source = realpathSync(modules);
  // Vite's caches aren't packages: the run's own tests rebuild what they need.
  const caches = [join(source, ".vite"), join(source, ".vite-temp")];
  cpSync(source, join(workspace, "node_modules"), {
    recursive: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
    filter: (src) => !caches.some((cache) => src === cache || src.startsWith(`${cache}${sep}`)),
  });
  excludeNodeModules(workspace);
}

/** `text` with the API key's value, when there is one, replaced by `[redacted]`, so no saved transcript holds it. */
function redactKey(text: string): string {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? text.split(key).join("[redacted]") : text;
}

/** A task's golden tests, which decide whether a run passed. */
function goldenTests(task: string): string {
  return `fixture/golden/${task}/test`;
}

/** True when `name` is an executable file in one of `PATH`'s directories. */
function onPath(name: string): boolean {
  return (process.env.PATH ?? "").split(delimiter).some((dir) => {
    const path = join(dir, name);
    try {
      accessSync(path, constants.X_OK);
      return statSync(path).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * What every run needs before the first one starts, one line per problem: an API key, `claude`
 * on PATH, and each task's golden tests.
 */
export function checkRunnable(root: string, tasks: string[]): string[] {
  const errors = process.env.ANTHROPIC_API_KEY ? [] : ["ANTHROPIC_API_KEY is not set"];
  if (!onPath("claude")) errors.push("claude not found on PATH");
  for (const task of tasks) {
    if (!existsSync(join(root, goldenTests(task)))) errors.push(`${goldenTests(task)}: missing`);
  }
  return errors;
}

/**
 * Copies every file under `fixture/golden/<task>/test/` into the workspace's `test/`, over the
 * agent's own copies, and runs the fixture's test command there; true when it exits 0.
 */
function acceptancePasses(root: string, task: string, workspace: string): boolean {
  const command = loadTestCommand(root);
  if (command === undefined) return false;
  cpSync(join(root, goldenTests(task)), join(workspace, "test"), { recursive: true, force: true });
  // Like the fixture check's suite runs: the allowlisted environment, without the API key.
  const suite = spawnSync(command, { cwd: workspace, shell: true, stdio: "ignore", timeout: SUITE_TIMEOUT_MS, env: allowlistedEnv() });
  return suite.status === 0;
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
 * finds `claude`, and `TMPDIR`), `CLAUDE_CONFIG_DIR` as `configDir`, created empty, so the
 * machine's Claude Code settings, memory and plugins never enter the run, and `HOME` as `home`,
 * created empty, with `$HOME/.local/bin` first on `PATH`: installers write there instead of the
 * machine's home, and `claude` finds what they installed. Commits made in the run are by
 * `bench <bench@localhost>`, the same for every workflow.
 */
function runEnv(configDir: string, home: string): NodeJS.ProcessEnv {
  mkdirSync(configDir);
  mkdirSync(home);
  const env = allowlistedEnv();
  env.CLAUDE_CONFIG_DIR = configDir;
  env.HOME = home;
  env.PATH = [join(home, ".local", "bin"), env.PATH].filter((dir) => dir !== undefined).join(delimiter);
  // Fixed, so no workflow's run depends on the machine's git identity.
  Object.assign(env, BENCH_GIT_IDENTITY);
  return env;
}
