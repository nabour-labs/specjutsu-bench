import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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
 * setup script, the task's prompt script, every file under `fixture/start/` and the task's golden
 * tests, as relative paths and bytes in sorted order.
 */
export function fingerprint(root: string, model: string, workflow: string, task: string): string {
  const paths = [
    "pins.json",
    `agents/${workflow}/setup.yaml`,
    `agents/${workflow}/${task}.yaml`,
    ...filesUnder(root, "fixture/start"),
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

/** Runs 1 to `runs` of every workflow and task that are saved with the current fingerprint, in order. */
export function savedRuns(root: string, model: string, tasks: string[], runs: number): Runs {
  const all: Runs = {};
  for (const workflow of WORKFLOWS) {
    all[workflow] = {};
    for (const task of tasks) {
      const current = fingerprint(root, model, workflow, task);
      all[workflow][task] = [];
      for (let n = 1; n <= runs; n++) {
        const path = savedPath(root, workflow, task, n);
        if (!existsSync(path)) continue;
        const saved = JSON.parse(readFileSync(path, "utf8")) as SavedRun;
        if (saved.fingerprint === current) all[workflow][task].push(saved.run);
      }
    }
  }
  return all;
}
