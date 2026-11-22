import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { benchRoot, replay, stepScript } from "./helpers.ts";

it("STEP-001 refuses a step without a source and leaves results/ unchanged", () => {
  const script = `${stepScript(3)}  - kind: run\n    command: sj status\n`;
  const root = benchRoot({ "steps/speckit/feature.yaml": script });
  mkdirSync(join(root, "results"));
  writeFileSync(join(root, "results", "results.json"), '{"earlier": true}\n');

  const run = replay(root);

  expect(run.stderr).toContain("steps/speckit/feature.yaml step 4: missing source");
  expect(run.status).toBe(1);
  expect(readFileSync(join(root, "results", "results.json"), "utf8")).toBe('{"earlier": true}\n');
});

it("STEP-004 refuses a missing step script", () => {
  const root = benchRoot({ "steps/openspec/bugfix.yaml": null });

  const run = replay(root);

  expect(run.stderr).toContain("missing steps/openspec/bugfix.yaml");
  expect(run.status).toBe(1);
});

it("replay accepts exact pins and complete, sourced scripts", () => {
  const run = replay(benchRoot());

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
});

it("STEP-002 refuses a load step whose file is not in the pinned Superpowers install", () => {
  const load =
    "  - kind: load\n    tool: superpowers\n    path: skills/test-driven-development/SKILL.md\n    source: https://example.com/docs#load\n";
  const root = benchRoot({ "steps/speckit/feature.yaml": `${stepScript(1)}${load}` });
  const pin = (JSON.parse(readFileSync(join(root, "pins.json"), "utf8")) as { superpowers: string }).superpowers;
  mkdirSync(join(root, ".bench", "tools", `superpowers@${pin}`, "skills"), { recursive: true });

  const run = replay(root);

  expect(run.stderr).toContain(
    `steps/speckit/feature.yaml step 2: skills/test-driven-development/SKILL.md not found in superpowers@${pin}`,
  );
  expect(run.status).toBe(1);
});
