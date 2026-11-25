import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { leftOutOfStart } from "../replay.ts";
import { WORKFLOWS } from "../steps.ts";
import type { Run, Runs } from "./run.ts";

/** Where finished runs are saved, one file per run: `<workflow>/<task>/run-<n>.json`. */
export const SAVED_RUNS = ".bench/runs";

/** A saved run: the run, and the fingerprint of the inputs it ran with. */
type SavedRun = { fingerprint: string; run: Run };

/** Every file under `dir`, relative to `root`; none when `dir` is missing. */
function filesUnder(root: string, dir: string): string[] {
  const path = join(root, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

/**
 * sha256 over what a run of `workflow` on `task` measures: the model, `pins.json`, the workflow's
 * setup script, the task's prompt script, `fixture/tasks.json` with its acceptance test command,
 * every file under `fixture/start/` that a workspace gets and the task's golden tests, as relative
 * paths and bytes in sorted order.
 */
export function fingerprint(root: string, model: string, workflow: string, task: string): string {
  const paths = [
    "pins.json",
    `agents/${workflow}/setup.yaml`,
    `agents/${workflow}/${task}.yaml`,
    "fixture/tasks.json",
    ...filesUnder(root, "fixture/start").filter((path) => !leftOutOfStart(relative("fixture/start", path))),
    ...filesUnder(root, `fixture/golden/${task}/test`),
  ].sort();
  const hash = createHash("sha256").update(`model ${model}\0`);
  for (const path of paths) {
    const file = join(root, path);
    const bytes = existsSync(file) ? readFileSync(file) : undefined;
    hash.update(`${path}\0${bytes === undefined ? "missing" : bytes.length}\0`);
    if (bytes !== undefined) hash.update(bytes);
  }
  return hash.digest("hex");
}

function savedPath(root: string, workflow: string, task: string, n: number): string {
  return join(root, SAVED_RUNS, workflow, task, `run-${n}.json`);
}

/** Saves the `n`-th run of `workflow` on `task` with its fingerprint, through a temporary file so a saved run is always whole. */
export function saveRun(root: string, workflow: string, task: string, n: number, run: Run, print: string): void {
  const path = savedPath(root, workflow, task, n);
  mkdirSync(dirname(path), { recursive: true });
  const saved: SavedRun = { fingerprint: print, run };
  writeFileSync(`${path}.tmp`, `${JSON.stringify(saved, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

/** Removes every saved run of `workflow`, so the next start does them again. */
export function discardRuns(root: string, workflow: string): void {
  rmSync(join(root, SAVED_RUNS, workflow), { recursive: true, force: true });
}

/** Every workflow and task's fingerprint, by workflow and task. */
export type Fingerprints = Record<string, Record<string, string>>;

/** The current fingerprint of every workflow and task. */
export function fingerprints(root: string, model: string, tasks: string[]): Fingerprints {
  return Object.fromEntries(
    WORKFLOWS.map((workflow) => [workflow, Object.fromEntries(tasks.map((task) => [task, fingerprint(root, model, workflow, task)]))]),
  );
}

/** The `n`-th run of `workflow` on `task` when it is saved with fingerprint `print`, else undefined. */
export function savedRun(root: string, workflow: string, task: string, n: number, print: string): Run | undefined {
  const path = savedPath(root, workflow, task, n);
  if (!existsSync(path)) return undefined;
  const saved = JSON.parse(readFileSync(path, "utf8")) as SavedRun;
  return saved.fingerprint === print ? saved.run : undefined;
}

/** Runs 1 to `runs` of every workflow and task that are saved with its fingerprint in `prints`, in order. */
export function savedRuns(root: string, prints: Fingerprints, runs: number): Runs {
  const all: Runs = {};
  for (const [workflow, tasks] of Object.entries(prints)) {
    all[workflow] = {};
    for (const [task, print] of Object.entries(tasks)) {
      all[workflow][task] = [];
      for (let n = 1; n <= runs; n++) {
        const run = savedRun(root, workflow, task, n, print);
        if (run !== undefined) all[workflow][task].push(run);
      }
    }
  }
  return all;
}
