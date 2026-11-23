import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKFLOWS } from "../src/steps.ts";

const pkg = fileURLToPath(new URL("..", import.meta.url));

export const TASKS = ["feature", "bugfix", "change"];

/** A step script with `count` steps that each cite a source. */
export function stepScript(count: number): string {
  const steps = Array.from({ length: count }, (_, i) =>
    `  - kind: read\n    path: file-${i + 1}.md\n    source: https://example.com/docs#step-${i + 1}\n`,
  );
  return `steps:\n${steps.join("")}`;
}

/**
 * A throwaway benchmark root that passes every check: this package's script, sources and
 * node_modules, exact pins, fixture/tasks.json and a valid script per workflow per task.
 * `files` adds or replaces files by relative path; a null value leaves that file out.
 */
export function benchRoot(files: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "replay-"));
  cpSync(join(pkg, "package.json"), join(root, "package.json"));
  cpSync(join(pkg, "src"), join(root, "src"), { recursive: true });
  symlinkSync(join(pkg, "node_modules"), join(root, "node_modules"));

  const all: Record<string, string | null> = {
    "pins.json": JSON.stringify({ openspec: "1.2.0", superpowers: "0123456789abcdef0123456789abcdef01234567" }),
    "fixture/tasks.json": JSON.stringify({ tasks: TASKS, test: `node -e "process.exit(0)"` }),
  };
  // The start state holds the files the default scripts read.
  for (let i = 1; i <= 3; i++) all[`fixture/start/file-${i}.md`] = `file ${i}\n`;
  for (const workflow of WORKFLOWS) {
    for (const task of TASKS) all[`steps/${workflow}/${task}.yaml`] = stepScript(3);
  }
  Object.assign(all, files);

  for (const [path, content] of Object.entries(all)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

export function replay(root: string) {
  return spawnSync("npm", ["run", "--silent", "replay"], { cwd: root, encoding: "utf8" });
}
