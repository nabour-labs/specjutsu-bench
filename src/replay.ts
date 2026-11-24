import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { allowlistedEnv, linkNodeModules, SUITE_TIMEOUT_MS } from "./fixture.ts";
import type { Pins } from "./pins.ts";
import { WORKFLOWS, loadSessionSteps, loadSteps, type Step } from "./steps.ts";

export type StepResult = { kind: Step["kind"]; path?: string; command?: string; context: number; output: number };
/** `firstStep` is the script's number for `steps[0]`: 0 when the replay added the session step, else 1. */
export type ScriptResult = { context: number; output: number; firstStep: number; steps: StepResult[] };
export type Results = { pins: Pins; workflows: Record<string, Record<string, ScriptResult>> };
/** Per `sj` command, the raw bytes the replay counted for its steps and the `printed` bytes `sj gain` reports. */
export type GainTotals = Record<string, { replay: number; gain: number }>;
/** The totals, and one line per specjutsu script whose `sj gain --json` failed. */
export type Gain = { totals: GainTotals; failures: string[] };

/** The `sj` commands whose printed bytes `sj gain --json` reports. */
const GAIN_COMMANDS = ["test", "verify", "next", "status"];

/**
 * Runs every workflow's script for every task and counts the bytes each step costs. `gain`
 * compares the specjutsu scripts' `sj` steps with what the pinned `sj gain` recorded in their
 * workspaces.
 */
export function replayAll(root: string, pins: Pins, tasks: string[]): { results: Results; gain: Gain } {
  const workflows: Results["workflows"] = {};
  const gain: Gain = { totals: {}, failures: [] };
  for (const workflow of WORKFLOWS) {
    workflows[workflow] = {};
    const sessionStart = loadSessionSteps(root, workflow)
      .filter((step) => step.kind === "load")
      .reduce((sum, step) => sum + loadBytes(root, pins, step), 0);
    for (const task of tasks) {
      const steps = loadSteps(root, `steps/${workflow}/${task}.yaml`);
      // A script that declares no session runs as one session for the task.
      const implicit = !steps.some((step) => step.kind === "session");
      const sessions: Step[] = implicit ? [{ kind: "session" }, ...steps] : steps;
      workflows[workflow][task] = replayScript(
        root,
        pins,
        workflow,
        task,
        sessionStart,
        sessions,
        implicit ? 0 : 1,
        workflow === "specjutsu" ? gain : undefined,
      );
    }
  }
  return { results: { pins, workflows }, gain };
}

/** The pinned specjutsu install's `bin/`, put first on PATH for run steps; preflight checks `bin/sj` exists. */
function sjBin(root: string, pins: Pins): string | undefined {
  return pins.specjutsu ? join(root, ".bench", "tools", `specjutsu@${pins.specjutsu}`, "bin") : undefined;
}

/** The `sj` command a run step calls, when `sj gain` reports it. */
function gainCommand(command: string): string | undefined {
  const name = /^sj (\w+)\b/.exec(command)?.[1];
  return name && GAIN_COMMANDS.includes(name) ? name : undefined;
}

function addGain(gain: GainTotals, command: string, side: "replay" | "gain", bytes: number): void {
  gain[command] ??= { replay: 0, gain: 0 };
  gain[command][side] += bytes;
}

/**
 * Adds the `printed` bytes the pinned `sj gain --json` reports for the runs in `workspace`, or a
 * failure line naming `script` (never the workspace path) when it fails or prints no JSON.
 */
function addGainReport(root: string, pins: Pins, script: string, workspace: string, env: NodeJS.ProcessEnv, gain: Gain): void {
  const run = spawnSync(join(sjBin(root, pins)!, "sj"), ["gain", "--json", "--root", workspace], {
    cwd: workspace,
    env,
    encoding: "utf8",
  });
  const fail = (reason: string) => gain.failures.push(`sj gain --json failed for ${script}: ${reason}`);
  if (run.error || run.status !== 0) {
    fail(run.stderr?.split("\n").find((line) => line.trim() !== "")?.trim() ?? "unreadable");
    return;
  }
  let commands: { command: string; printed: number }[];
  try {
    commands = (JSON.parse(run.stdout) as { commands: typeof commands }).commands;
    if (!Array.isArray(commands)) throw new Error("no commands");
  } catch {
    fail("unreadable");
    return;
  }
  for (const { command, printed } of commands) {
    if (GAIN_COMMANDS.includes(command)) addGain(gain.totals, command, "gain", printed);
  }
}

/** Runs one script in a fresh copy of `fixture/start/`, removed afterwards. */
function replayScript(
  root: string,
  pins: Pins,
  workflow: string,
  task: string,
  sessionStart: number,
  steps: Step[],
  firstStep: number,
  gain: Gain | undefined,
): ScriptResult {
  const workspace = mkdtempSync(join(tmpdir(), "replay-workspace-"));
  const xdgHome = mkdtempSync(join(tmpdir(), "replay-xdg-"));
  try {
    // Run steps and `sj gain` run with the pinned `sj` first on PATH.
    const env = workspaceEnv(xdgHome);
    const bin = sjBin(root, pins);
    if (bin) env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
    const start = join(root, "fixture", "start");
    // Stale `sj gain` records in the start state are left out, and the workspace is a git repo
    // because `sj` records gain only inside one.
    // A `node_modules` installed in the start state is left out too: the bench's own is linked in
    // after the commit.
    const left = [join(start, ".specjutsu", "ledger"), join(start, "node_modules")];
    cpSync(start, workspace, {
      recursive: true,
      filter: (src) => !left.some((path) => src === path || src.startsWith(`${path}${sep}`)),
    });
    commitStart(workspace);
    // Run steps use the bench's installed packages, as the fixture check does.
    // git's `node_modules/` patterns match only directories, so the link is excluded by name.
    if (linkNodeModules(root, workspace)) {
      const info = join(workspace, ".git", "info");
      mkdirSync(info, { recursive: true });
      appendFileSync(join(info, "exclude"), "/node_modules\n");
    }
    const paths = replacedPaths(root, workspace);
    let ranSj = false;
    const results = steps.map((step, index) => {
      const at = `${workflow}/${task} step ${firstStep + index}`;
      const { context, output, raw } = count(root, pins, task, sessionStart, workspace, env, paths, step, at);
      const command = step.kind === "run" ? gainCommand(step.command!) : undefined;
      if (gain && command && raw !== undefined) {
        addGain(gain.totals, command, "replay", raw);
        ranSj = true;
      }
      return { ...label(step), context, output };
    });
    if (gain && ranSj) addGainReport(root, pins, `specjutsu/${task}`, workspace, env, gain);
    return {
      context: results.reduce((sum, step) => sum + step.context, 0),
      output: results.reduce((sum, step) => sum + step.output, 0),
      firstStep,
      steps: results,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(xdgHome, { recursive: true, force: true });
  }
}

/** The workspace's fixed author, committer and date, so the start commit's hash is the same everywhere. */
const START_COMMIT = {
  GIT_AUTHOR_NAME: "bench",
  GIT_AUTHOR_EMAIL: "bench@localhost",
  GIT_COMMITTER_NAME: "bench",
  GIT_COMMITTER_EMAIL: "bench@localhost",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

/** Thrown when the workspace's start commit fails; the replay stops and writes no results. */
export class StartCommitError extends Error {}

/** Thrown when a run step's command can't be run to the end; the replay stops and writes no results. */
export class RunStepError extends Error {}

/** Thrown when a read step's file is not in the workspace; the replay stops and writes no results. */
export class ReadStepError extends Error {}

/** The most a run step may print, so its output is counted in full. */
const RUN_MAX_BUFFER = 256 * 1024 * 1024;

/**
 * The environment for a workspace's run steps and its `sj gain --json`, so that nothing about the
 * machine changes what they print: only the allowlisted variables (`PATH`, `HOME`, `TMPDIR`) are
 * kept, so neither CI detection nor git's own variables get through;
 * - npm's update, fund and audit notices are off and `LANG` and `LC_ALL` are `C.UTF-8` (see
 *   `allowlistedEnv`);
 * - no global or system config is read, nor the system attributes;
 * - `XDG_CONFIG_HOME` is `xdgHome`, an empty dir, so no `~/.config/git/ignore` or `attributes`;
 *   `HOME` is kept, as npm, npx and sj may use it;
 * - `COLUMNS` is 80.
 */
function workspaceEnv(xdgHome: string): NodeJS.ProcessEnv {
  return Object.assign(allowlistedEnv(), {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_ATTR_NOSYSTEM: "1",
    XDG_CONFIG_HOME: xdgHome,
    COLUMNS: "80",
  });
}

/**
 * Makes the workspace a git repo with the start files committed on `main`, so that nothing about
 * the machine changes the commit's hash:
 * - every `GIT_*` variable is dropped (repo location, `git -c` config, `GIT_ATTR_SOURCE`, …);
 * - no global, system or `git -c` config is read, nor the system attributes;
 * - `HOME` and `XDG_CONFIG_HOME` are an empty dir, so no `~/.gitconfig` or `~/.config/git/*`;
 * - init uses no template.
 */
function commitStart(workspace: string): void {
  const home = mkdtempSync(join(tmpdir(), "replay-git-home-"));
  try {
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
    );
    Object.assign(env, START_COMMIT, {
      HOME: home,
      XDG_CONFIG_HOME: home,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_ATTR_NOSYSTEM: "1",
    });
    // The default ignore and attributes files are turned off as well as moved, and fsmonitor
    // can run a hook, so it is off too.
    const config = ["core.hooksPath=", "commit.gpgsign=false", "core.excludesFile=", "core.attributesFile=", "core.fsmonitor=false"];
    for (const args of [
      ["init", "-q", "--template=", "-b", "main", "--object-format=sha1"],
      ["add", "-A"],
      ["commit", "-q", "--no-verify", "-m", "fixture start"],
    ]) {
      const git = spawnSync("git", [...config.flatMap((pair) => ["-c", pair]), ...args], {
        cwd: workspace,
        env,
        encoding: "utf8",
      });
      if (git.error || git.status !== 0) {
        // git prints most failures to stderr, but "nothing to commit" as stdout's last line.
        const lines = (text: string | undefined) => (text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
        const reason = git.error?.message ?? lines(git.stderr)[0] ?? lines(git.stdout).at(-1);
        throw new StartCommitError(`start commit failed: ${reason ?? `git ${args[0]} exited ${git.status}`}`);
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function label(step: Step): Pick<StepResult, "kind" | "path" | "command"> {
  return { kind: step.kind, ...(step.path ? { path: step.path } : {}), ...(step.command ? { command: step.command } : {}) };
}

function loadBytes(root: string, pins: Pins, step: Step): number {
  return statSync(join(root, ".bench", "tools", `${step.tool}@${pins[step.tool!]}`, step.path!)).size;
}

/**
 * The paths a run step's output may name that depend on the machine, each with its fixed value:
 * the workspace as `/workspace`, and the bench checkout as `/bench`, both absolute and as the path
 * from the workspace (a tool names a file in the linked `node_modules` that way). Each is taken as
 * given and as its realpath (macOS tmpdir paths print as both `/var/...` and `/private/var/...`),
 * and the longest is replaced first.
 */
function replacedPaths(root: string, workspace: string): [string, string][] {
  const workspaces = [...new Set([workspace, realpathSync(workspace)])];
  const benches = [...new Set([resolve(root), realpathSync(root)])];
  const pairs = new Map<string, string>();
  for (const bench of benches) pairs.set(bench, "/bench");
  for (const from of workspaces) {
    for (const bench of benches) {
      const path = relative(from, bench);
      // A path made only of `..` (a workspace inside the checkout) would match too much.
      if (!/^(\.\.(\/|$))*$/.test(path)) pairs.set(path, "/bench");
    }
  }
  for (const path of workspaces) pairs.set(path, "/workspace");
  return [...pairs].sort(([a], [b]) => b.length - a.length);
}

/** Counts output with every duration as `0ms`, every clock time as `00:00:00` and each path in `paths` as its fixed value. */
function normalizedBytes(output: Buffer, paths: [string, string][]): number {
  const text = paths
    .reduce((out, [path, fixed]) => out.split(path).join(fixed), output.toString("utf8"))
    .replace(/\b\d+(\.\d+)?(ms|s)\b/g, "0ms")
    .replace(/\b\d{2}:\d{2}:\d{2}\b/g, "00:00:00");
  return Buffer.byteLength(text);
}

function count(
  root: string,
  pins: Pins,
  task: string,
  sessionStart: number,
  workspace: string,
  env: NodeJS.ProcessEnv,
  paths: [string, string][],
  step: Step,
  /** The step as messages name it: `<tool>/<task> step <n>`. */
  at: string,
): { context: number; output: number; raw?: number } {
  switch (step.kind) {
    case "load":
      return { context: loadBytes(root, pins, step), output: 0 };
    case "read": {
      const file = statSync(join(workspace, step.path!), { throwIfNoEntry: false });
      if (!file) throw new ReadStepError(`${at}: read failed: ${step.path} not found`);
      return { context: file.size, output: 0 };
    }
    case "run": {
      const run = spawnSync(step.command!, { cwd: workspace, shell: true, env, maxBuffer: RUN_MAX_BUFFER, timeout: SUITE_TIMEOUT_MS });
      // Partial output is never counted: an overflow, a timeout or a failed spawn stops the replay.
      if (run.error) throw new RunStepError(`${at}: run failed: ${run.error.message}`);
      // `sj gain` counts what was printed, before normalisation.
      return {
        context: normalizedBytes(run.stdout, paths) + normalizedBytes(run.stderr, paths),
        output: 0,
        raw: run.stdout.length + run.stderr.length,
      };
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
