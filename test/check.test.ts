import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TASKS, benchRoot, replay, replayCheck, stepScript } from "./helpers.ts";

function step(fields: string): string {
  return `  - kind: ${fields}    source: https://example.com/docs#step\n`;
}

/** Every file in results/ by name, so a test can show `--check` left it untouched. */
function resultsFiles(root: string): Record<string, string> {
  const dir = join(root, "results");
  return Object.fromEntries(readdirSync(dir).map((file) => [file, readFileSync(join(dir, file), "utf8")]));
}

/** Commits results from a first run and returns a snapshot of them. */
function commitResults(root: string): Record<string, string> {
  const run = replay(root);
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  return resultsFiles(root);
}

it("REPLAY-006 fails the check naming speckit/feature step 6: context 3000 → 3100", () => {
  // The script declares no session; the replay's implicit session step must not shift its numbering.
  const script = "steps:\n" + step("read\n    path: file-1.md\n").repeat(5) + step("read\n    path: big.md\n");
  const root = benchRoot({ "steps/speckit/feature.yaml": script, "fixture/start/big.md": "x".repeat(3000) });
  const committed = commitResults(root);
  writeFileSync(join(root, "fixture", "start", "big.md"), "x".repeat(3100));

  const run = replayCheck(root);

  expect(run.stderr).toBe("");
  expect(run.stdout.trim()).toBe("speckit/feature step 6: context 3000 → 3100");
  expect(run.status).toBe(1);
  expect(resultsFiles(root)).toEqual(committed);
});

it("REPLAY-007 names the speckit pin move 0.0.79 → 0.0.80 before any byte difference", () => {
  const pins = (speckit: string) =>
    JSON.stringify({ openspec: "1.2.0", speckit, superpowers: "0123456789abcdef0123456789abcdef01234567" });
  const script = "steps:\n" + step("session\n") + step("load\n    tool: speckit\n    path: templates/spec.md\n");
  const root = benchRoot({
    "pins.json": pins("0.0.79"),
    "steps/speckit/feature.yaml": script,
    ".bench/tools/speckit@0.0.79/templates/spec.md": "s".repeat(1000),
    ".bench/tools/speckit@0.0.80/templates/spec.md": "s".repeat(1200),
  });
  const committed = commitResults(root);
  writeFileSync(join(root, "pins.json"), pins("0.0.80"));

  const run = replayCheck(root);

  expect(run.stderr).toBe("");
  expect(run.stdout.trim().split("\n")).toEqual([
    "pin speckit 0.0.79 → 0.0.80",
    "speckit/feature step 2: context 1000 → 1200",
  ]);
  expect(run.status).toBe(1);
  expect(resultsFiles(root)).toEqual(committed);
});

it("REPLAY-008 passes the check with results match when the committed results match a fresh run", () => {
  const root = benchRoot();
  const committed = commitResults(root);

  const run = replayCheck(root);

  expect(run.stderr).toBe("");
  expect(run.stdout.trim()).toBe("results match");
  expect(run.status).toBe(0);
  expect(resultsFiles(root)).toEqual(committed);
});

describe("--check beyond the scenarios", () => {
  const tasksJson = (tasks: string[]) => JSON.stringify({ tasks, test: `node -e "process.exit(0)"` });

  it("names a script the committed results have and a fresh run does not", () => {
    const root = benchRoot();
    const committed = commitResults(root);
    writeFileSync(join(root, "fixture", "tasks.json"), tasksJson(["feature", "bugfix"]));

    const run = replayCheck(root);

    expect(run.stderr).toBe("");
    expect(run.stdout.trim()).toBe("specjutsu/change: missing");
    expect(run.status).toBe(1);
    expect(resultsFiles(root)).toEqual(committed);
  });

  it("names a script a fresh run has and the committed results do not", () => {
    const root = benchRoot({
      "steps/specjutsu/extra.yaml": stepScript(3),
      "steps/speckit/extra.yaml": stepScript(3),
      "steps/openspec/extra.yaml": stepScript(3),
    });
    const committed = commitResults(root);
    writeFileSync(join(root, "fixture", "tasks.json"), tasksJson([...TASKS, "extra"]));

    const run = replayCheck(root);

    expect(run.stderr).toBe("");
    expect(run.stdout.trim()).toBe("specjutsu/extra: added");
    expect(run.status).toBe(1);
    expect(resultsFiles(root)).toEqual(committed);
  });

  it("reports missing committed results and writes none", () => {
    const root = benchRoot();

    const run = replayCheck(root);

    expect(run.stderr.trim()).toBe("results/results.json: missing");
    expect(run.stdout).toBe("");
    expect(run.status).toBe(1);
    expect(existsSync(join(root, "results"))).toBe(false);
  });

  it("reports committed results it cannot parse and leaves them untouched", () => {
    const root = benchRoot({ "results/results.json": "not json\n" });

    const run = replayCheck(root);

    expect(run.stderr.trim()).toBe("results/results.json: unreadable");
    expect(run.stdout).toBe("");
    expect(run.status).toBe(1);
    expect(readFileSync(join(root, "results", "results.json"), "utf8")).toBe("not json\n");
  });
});
