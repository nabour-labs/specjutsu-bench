import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Longest a fixture suite may run before its state counts as failing (a hang or watch mode). */
const SUITE_TIMEOUT_MS = 5 * 60 * 1000;

/** The shell command that runs the fixture's own test suite: the `test` key of fixture/tasks.json. */
export function loadTestCommand(root: string): string | undefined {
  const { test } = JSON.parse(readFileSync(join(root, "fixture", "tasks.json"), "utf8")) as { test?: unknown };
  return typeof test === "string" && test.trim() !== "" ? test : undefined;
}

/**
 * Runs the fixture's suite at the start state and at each task's golden end state
 * (start with `fixture/golden/<task>/` copied over it); one error line per failing state.
 */
export function checkFixtureStates(root: string, tasks: string[]): string[] {
  const command = loadTestCommand(root);
  if (command === undefined) return ["fixture/tasks.json: missing test command"];
  const states: [string, string | undefined][] = [
    ["fixture start state", undefined],
    ...tasks.map((task): [string, string] => [`fixture ${task} end state`, task]),
  ];
  return states.flatMap(([name, task]) => (statePasses(root, command, task) ? [] : [`${name}: tests fail`]));
}

/** Links the bench's `node_modules` into `dir`, when the bench has one and `dir` has none. */
export function linkNodeModules(root: string, dir: string): void {
  const modules = join(root, "node_modules");
  if (existsSync(modules) && !existsSync(join(dir, "node_modules"))) symlinkSync(modules, join(dir, "node_modules"));
}

function statePasses(root: string, command: string, task: string | undefined): boolean {
  const dir = mkdtempSync(join(tmpdir(), "replay-state-"));
  try {
    cpSync(join(root, "fixture", "start"), dir, { recursive: true });
    // A task without a golden dir is checked as the start state; task 4.1 supplies the golden dirs.
    const golden = task && join(root, "fixture", "golden", task);
    if (golden && existsSync(golden)) cpSync(golden, dir, { recursive: true });
    linkNodeModules(root, dir);
    // A timed-out run has a null status, so it reports as `<state>: tests fail`.
    return spawnSync(command, { cwd: dir, shell: true, stdio: "ignore", timeout: SUITE_TIMEOUT_MS }).status === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
