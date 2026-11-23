import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { benchRoot, replay } from "./helpers.ts";

const SUPERPOWERS = "0123456789abcdef0123456789abcdef01234567";

type Results = {
  workflows: Record<string, Record<string, { context: number; output: number; steps: { kind: string; context: number; output: number }[] }>>;
};

function results(root: string): Results {
  return JSON.parse(readFileSync(join(root, "results", "results.json"), "utf8")) as Results;
}

/** The script's own steps, without the implicit session entry the replay adds first. */
function ownSteps(script: Results["workflows"][string][string]) {
  return script.steps.filter((s) => s.kind !== "session");
}

function step(fields: string): string {
  return `  - kind: ${fields}    source: https://example.com/docs#step\n`;
}

it("REPLAY-001 records context bytes for load, read and run steps and the script total", () => {
  const script =
    "steps:\n" +
    step("load\n    tool: superpowers\n    path: skills/brainstorming/SKILL.md\n") +
    step("read\n    path: src/app.ts\n") +
    step(`run\n    command: node -e "process.stdout.write('x'.repeat(3000))"\n`);
  const root = benchRoot({
    "steps/speckit/feature.yaml": script,
    [`.bench/tools/superpowers@${SUPERPOWERS}/skills/brainstorming/SKILL.md`]: "s".repeat(1200),
    "fixture/start/src/app.ts": "a".repeat(800),
  });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const feature = results(root).workflows.speckit.feature;
  expect(ownSteps(feature).map((s) => s.context)).toEqual([1200, 800, 3000]);
  expect(feature.context).toBe(5000);
});

it("REPLAY-002 records a written golden file as output and a later read of it as context", () => {
  const script = "steps:\n" + step("write\n    path: plan.md\n") + step("read\n    path: plan.md\n");
  const root = benchRoot({
    "steps/speckit/feature.yaml": script,
    "fixture/golden/feature/plan.md": "p".repeat(2000),
  });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const [write, read] = ownSteps(results(root).workflows.speckit.feature);
  expect(write).toMatchObject({ kind: "write", output: 2000, context: 0 });
  expect(read).toMatchObject({ kind: "read", context: 2000 });
});

it("REPLAY-003 counts a 4,000-byte bootstrap at each of 2 declared sessions as two steps, 8,000 bytes", () => {
  const bootstrap = "skills/using-superpowers/SKILL.md";
  const session = "steps:\n" + step(`load\n    tool: superpowers\n    path: ${bootstrap}\n`);
  const script = "steps:\n" + step("session\n") + step("read\n    path: file-1.md\n") + step("session\n");
  const root = benchRoot({
    "steps/speckit/session.yaml": session,
    "steps/speckit/feature.yaml": script,
    [`.bench/tools/superpowers@${SUPERPOWERS}/${bootstrap}`]: "b".repeat(4000),
  });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const feature = results(root).workflows.speckit.feature;
  const sessions = feature.steps.filter((s) => s.kind === "session");
  expect(sessions).toEqual([
    { kind: "session", context: 4000, output: 0 },
    { kind: "session", context: 4000, output: 0 },
  ]);
  expect(sessions.reduce((sum, s) => sum + s.context, 0)).toBe(8000);
  // file-1.md holds "file 1\n", 7 bytes.
  expect(feature.context).toBe(8007);
});

it("REPLAY-011 records one 4,000-byte session step before the own steps of a script with no session step", () => {
  const bootstrap = "skills/using-superpowers/SKILL.md";
  const session = "steps:\n" + step(`load\n    tool: superpowers\n    path: ${bootstrap}\n`);
  const script = "steps:\n" + step("read\n    path: file-1.md\n") + step("read\n    path: file-2.md\n");
  const root = benchRoot({
    "steps/speckit/session.yaml": session,
    "steps/speckit/feature.yaml": script,
    [`.bench/tools/superpowers@${SUPERPOWERS}/${bootstrap}`]: "b".repeat(4000),
  });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const feature = results(root).workflows.speckit.feature;
  expect(feature.steps).toEqual([
    { kind: "session", context: 4000, output: 0 },
    { kind: "read", path: "file-1.md", context: 7, output: 0 },
    { kind: "read", path: "file-2.md", context: 7, output: 0 },
  ]);
});

it("REPLAY-009 refuses a bugfix golden end state whose tests fail, replaying no script", () => {
  // The fixture's suite fails when broken.txt is present; only the bugfix golden dir adds it.
  const root = benchRoot({
    "fixture/tasks.json": JSON.stringify({ tasks: ["feature", "bugfix", "change"], test: "node check.mjs" }),
    "fixture/start/check.mjs": `import { existsSync } from "node:fs";\nprocess.exit(existsSync("broken.txt") ? 1 : 0);\n`,
    "fixture/golden/bugfix/broken.txt": "broken\n",
    "results/results.json": "previous\n",
  });

  const run = replay(root);

  expect(run.stderr.trim()).toBe("fixture bugfix end state: tests fail");
  expect(run.status).toBe(1);
  expect(readFileSync(join(root, "results", "results.json"), "utf8")).toBe("previous\n");
});
