import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, sep } from "node:path";
import { linkNodeModules } from "./fixture.ts";
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
function addGainReport(root: string, pins: Pins, script: string, workspace: string, gain: Gain): void {
  const run = spawnSync(join(sjBin(root, pins)!, "sj"), ["gain", "--json", "--root", workspace], {
    cwd: workspace,
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
  task: string,
  sessionStart: number,
  steps: Step[],
  firstStep: number,
  gain: Gain | undefined,
): ScriptResult {
  const workspace = mkdtempSync(join(tmpdir(), "replay-workspace-"));
  try {
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
    // A tool may print the workspace path as given or as its realpath, so both are replaced, the
    // longer first (macOS tmpdir paths print as both `/var/...` and `/private/var/...`).
    const paths = [...new Set([workspace, realpathSync(workspace)])].sort((a, b) => b.length - a.length);
    let ranSj = false;
    const results = steps.map((step) => {
      const { context, output, raw } = count(root, pins, task, sessionStart, workspace, paths, step);
      const command = step.kind === "run" ? gainCommand(step.command!) : undefined;
      if (gain && command && raw !== undefined) {
        addGain(gain.totals, command, "replay", raw);
        ranSj = true;
      }
      return { ...label(step), context, output };
    });
    if (gain && ranSj) addGainReport(root, pins, `specjutsu/${task}`, workspace, gain);
    return {
      context: results.reduce((sum, step) => sum + step.context, 0),
      output: results.reduce((sum, step) => sum + step.output, 0),
      firstStep,
      steps: results,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
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

/**
 * The environment without the variables that point git at another repo, as a git hook or CI
 * wrapper may set them: git's own `rev-parse --local-env-vars` list, less its `git -c` config
 * variables, and `GIT_CEILING_DIRECTORIES`.
 */
function workspaceEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_OBJECT_DIRECTORY",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_IMPLICIT_WORK_TREE",
    "GIT_GRAFT_FILE",
    "GIT_INDEX_FILE",
    "GIT_NO_REPLACE_OBJECTS",
    "GIT_REPLACE_REF_BASE",
    "GIT_PREFIX",
    "GIT_SHALLOW_FILE",
    "GIT_COMMON_DIR",
    "GIT_CEILING_DIRECTORIES",
  ]) {
    delete env[name];
  }
  return env;
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
      ["init", "-q", "--template=", "-b", "main"],
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

/** Counts output with every duration as `0ms`, every clock time as `00:00:00` and each of `paths` as `/workspace`. */
function normalizedBytes(output: Buffer, paths: string[]): number {
  const text = paths
    .reduce((out, path) => out.split(path).join("/workspace"), output.toString("utf8"))
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
  paths: string[],
  step: Step,
): { context: number; output: number; raw?: number } {
  switch (step.kind) {
    case "load":
      return { context: loadBytes(root, pins, step), output: 0 };
    case "read":
      return { context: statSync(join(workspace, step.path!)).size, output: 0 };
    case "run": {
      const bin = sjBin(root, pins);
      const env = workspaceEnv();
      if (bin) env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
      const run = spawnSync(step.command!, { cwd: workspace, shell: true, env });
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
