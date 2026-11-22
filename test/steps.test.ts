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
