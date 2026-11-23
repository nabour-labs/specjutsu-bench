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

/** One read step per task, each reading a start file of the given size. */
function sizedScripts(sizes: Record<string, Record<string, number>>): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [workflow, tasks] of Object.entries(sizes)) {
    for (const [task, size] of Object.entries(tasks)) {
      files[`steps/${workflow}/${task}.yaml`] = "steps:\n" + step(`read\n    path: ${workflow}-${task}.md\n`);
      files[`fixture/start/${workflow}-${task}.md`] = "x".repeat(size);
    }
  }
  return files;
}

it("REPLAY-004 shows per-task rows, totals of 10,000, 40,000 and 25,000 and the saving in results.md", () => {
  const root = benchRoot(
    sizedScripts({
      specjutsu: { feature: 2000, bugfix: 3000, change: 5000 },
      speckit: { feature: 10000, bugfix: 10000, change: 20000 },
      openspec: { feature: 5000, bugfix: 10000, change: 10000 },
    }),
  );

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const lines = readFileSync(join(root, "results", "results.md"), "utf8").split("\n");
  for (const row of [
    "| specjutsu | feature | 2000 | 500 | 0 |",
    "| specjutsu | bugfix | 3000 | 750 | 0 |",
    "| specjutsu | change | 5000 | 1250 | 0 |",
    "| speckit | feature | 10000 | 2500 | 0 |",
    "| speckit | bugfix | 10000 | 2500 | 0 |",
    "| speckit | change | 20000 | 5000 | 0 |",
    "| openspec | feature | 5000 | 1250 | 0 |",
    "| openspec | bugfix | 10000 | 2500 | 0 |",
    "| openspec | change | 10000 | 2500 | 0 |",
  ]) {
    expect(lines).toContain(row);
  }
  expect(lines).toContain("| specjutsu | total | 10000 | 2500 | 0 |");
  expect(lines).toContain("| speckit | total | 40000 | 10000 | 0 |");
  expect(lines).toContain("| openspec | total | 25000 | 6250 | 0 |");
  expect(lines).toContain("specjutsu saves 75% vs speckit, 60% vs openspec");
});

it("REPLAY-005 writes byte-identical results.json and results.md on two runs", () => {
  const root = benchRoot({
    "steps/speckit/feature.yaml":
      "steps:\n" + step("write\n    path: plan.md\n") + step("read\n    path: plan.md\n") +
      step(`run\n    command: node -e "process.stdout.write('ok')"\n`),
    "fixture/golden/feature/plan.md": "plan\n",
  });
  const files = ["results.json", "results.md"];
  const read = () => files.map((file) => readFileSync(join(root, "results", file)));

  expect(replay(root).status).toBe(0);
  const first = read();
  expect(replay(root).status).toBe(0);
  const second = read();

  for (const [i, file] of files.entries()) {
    expect(second[i].equals(first[i]), file).toBe(true);
    expect(first[i].toString("utf8"), file).not.toContain(root);
  }
});

it("REPLAY-012 counts a run step's timings as 00:00:00 and 0ms, the same on both runs", () => {
  // print.mjs prints the first run's timings, or the second run's when REPLAY_012_RUN is 2.
  const root = benchRoot({
    "steps/speckit/feature.yaml": "steps:\n" + step("run\n    command: node print.mjs\n"),
    "fixture/start/print.mjs":
      `const second = process.env.REPLAY_012_RUN === "2";\n` +
      `console.log(second ? "Start at 09:15:40" : "Start at 14:02:11");\n` +
      `console.log(second ? "Duration 12.3s" : "Duration 6.92s");\n`,
  });
  const runContext = (n: string) => {
    process.env.REPLAY_012_RUN = n;
    try {
      const run = replay(root);
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    } finally {
      delete process.env.REPLAY_012_RUN;
    }
    return ownSteps(results(root).workflows.speckit.feature)[0].context;
  };

  const first = runContext("1");
  const second = runContext("2");

  const normalized = Buffer.byteLength("Start at 00:00:00\nDuration 0ms\n");
  expect(first).toBe(normalized);
  expect(second).toBe(normalized);
});
