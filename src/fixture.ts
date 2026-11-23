import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The shell command that runs the fixture's own test suite, from fixture/tasks.json. */
export function loadTestCommand(root: string): string {
  return (JSON.parse(readFileSync(join(root, "fixture", "tasks.json"), "utf8")) as { test: string }).test;
}

/**
 * Runs the fixture's suite at the start state and at each task's golden end state
 * (start with `fixture/golden/<task>/` copied over it); one error line per failing state.
 */
export function checkFixtureStates(root: string, tasks: string[]): string[] {
  const command = loadTestCommand(root);
  const states: [string, string | undefined][] = [
    ["fixture start state", undefined],
    ...tasks.map((task): [string, string] => [`fixture ${task} end state`, task]),
  ];
  return states.flatMap(([name, task]) => (statePasses(root, command, task) ? [] : [`${name}: tests fail`]));
}

function statePasses(root: string, command: string, task: string | undefined): boolean {
  const dir = mkdtempSync(join(tmpdir(), "replay-state-"));
  try {
    cpSync(join(root, "fixture", "start"), dir, { recursive: true });
    const golden = task && join(root, "fixture", "golden", task);
    if (golden && existsSync(golden)) cpSync(golden, dir, { recursive: true });
    const modules = join(root, "node_modules");
    if (existsSync(modules) && !existsSync(join(dir, "node_modules"))) symlinkSync(modules, join(dir, "node_modules"));
    return spawnSync(command, { cwd: dir, shell: true, stdio: "ignore" }).status === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
