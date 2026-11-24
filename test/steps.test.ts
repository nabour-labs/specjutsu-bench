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
  // A directory at the path is not the file.
  mkdirSync(join(root, ".bench", "tools", `superpowers@${pin}`, "skills", "test-driven-development", "SKILL.md"), {
    recursive: true,
  });

  const run = replay(root);

  expect(run.stderr).toContain(
    `steps/speckit/feature.yaml step 2: skills/test-driven-development/SKILL.md not found in superpowers@${pin}`,
  );
  expect(run.status).toBe(1);
});

function loadStep(fields: string): string {
  return `  - kind: load\n${fields}    source: https://example.com/docs#load\n`;
}

it("STEP-005 refuses a load path outside the pinned install", () => {
  const step = loadStep("    tool: superpowers\n    path: ../../package.json\n");
  const root = benchRoot({ "steps/speckit/feature.yaml": `${stepScript(1)}${step}` });
  const pin = (JSON.parse(readFileSync(join(root, "pins.json"), "utf8")) as { superpowers: string }).superpowers;
  mkdirSync(join(root, ".bench", "tools", `superpowers@${pin}`), { recursive: true });
  writeFileSync(join(root, ".bench", "package.json"), "{}\n");

  const run = replay(root);

  expect(run.stderr).toContain(`steps/speckit/feature.yaml step 2: ../../package.json is outside superpowers@${pin}`);
  expect(run.status).toBe(1);
});

it("STEP-006 refuses a load from a tool with no pin", () => {
  const step = loadStep("    tool: kiro\n    path: skills/spec/SKILL.md\n");
  const root = benchRoot({ "steps/speckit/feature.yaml": `${stepScript(1)}${step}` });

  const run = replay(root);

  expect(run.stderr).toContain("steps/speckit/feature.yaml step 2: tool kiro is not pinned");
  expect(run.status).toBe(1);
});

it("STEP-007 refuses a load step without a tool", () => {
  const step = loadStep("    path: skills/test-driven-development/SKILL.md\n");
  const root = benchRoot({ "steps/openspec/change.yaml": `${stepScript(2)}${step}` });

  const run = replay(root);

  expect(run.stderr).toContain("steps/openspec/change.yaml step 3: load step missing tool");
  expect(run.status).toBe(1);
});

it("STEP-008 refuses a read step as the second step of steps/speckit/session.yaml", () => {
  const pin = "0123456789abcdef0123456789abcdef01234567";
  const bootstrap = "skills/using-superpowers/SKILL.md";
  const session = `steps:\n${loadStep(`    tool: superpowers\n    path: ${bootstrap}\n`)}${stepScript(1).replace("steps:\n", "")}`;
  const root = benchRoot({
    "steps/speckit/session.yaml": session,
    [`.bench/tools/superpowers@${pin}/${bootstrap}`]: "b".repeat(10),
  });

  const run = replay(root);

  expect(run.stderr).toContain("steps/speckit/session.yaml step 2: only load steps are allowed in session.yaml");
  expect(run.status).toBe(1);
});

/** The default three-step script with the second step citing `source`. */
function scriptCitingInStep2(source: string): string {
  return stepScript(3).replace("https://example.com/docs#step-2", source);
}

const speckitPins = JSON.stringify({
  openspec: "1.2.0",
  superpowers: "0123456789abcdef0123456789abcdef01234567",
  speckit: "1.4.3",
});

it("STEP-009 refuses a source that is neither <tool>@<pin>:<path> nor an https:// URL", () => {
  const root = benchRoot({ "steps/speckit/feature.yaml": scriptCitingInStep2("spec-kit README") });

  const run = replay(root);

  expect(run.stderr).toContain(
    'steps/speckit/feature.yaml step 2: source "spec-kit README" is not <tool>@<pin>:<path> or an https:// URL',
  );
  expect(run.status).toBe(1);
});

it("STEP-010 refuses a source citing speckit@1.4.2 when speckit is pinned to 1.4.3", () => {
  const root = benchRoot({
    "pins.json": speckitPins,
    "steps/speckit/feature.yaml": scriptCitingInStep2("speckit@1.4.2:templates/spec-template.md"),
    // Both versions hold the file, so only the version mismatch is wrong.
    ".bench/tools/speckit@1.4.2/templates/spec-template.md": "spec\n",
    ".bench/tools/speckit@1.4.3/templates/spec-template.md": "spec\n",
  });

  const run = replay(root);

  expect(run.stderr).toContain(
    "steps/speckit/feature.yaml step 2: source cites speckit@1.4.2, but speckit is pinned to 1.4.3",
  );
  expect(run.status).toBe(1);
});

it("STEP-011 refuses a source citing a file missing from the pinned Spec Kit checkout", () => {
  const root = benchRoot({
    "pins.json": speckitPins,
    "steps/speckit/feature.yaml": scriptCitingInStep2("speckit@1.4.3:templates/gone.md"),
    ".bench/tools/speckit@1.4.3/templates/spec-template.md": "spec\n",
  });

  const run = replay(root);

  expect(run.stderr).toContain("steps/speckit/feature.yaml step 2: source templates/gone.md not found in speckit@1.4.3");
  expect(run.status).toBe(1);
});

it("STEP-012 refuses a source range L10-L90 in a file of 80 lines", () => {
  const root = benchRoot({
    "pins.json": speckitPins,
    "steps/speckit/feature.yaml": scriptCitingInStep2("speckit@1.4.3:templates/spec-template.md#L10-L90"),
    ".bench/tools/speckit@1.4.3/templates/spec-template.md": Array.from({ length: 80 }, (_, i) => `line ${i + 1}\n`).join(""),
  });

  const run = replay(root);

  expect(run.stderr).toContain(
    "steps/speckit/feature.yaml step 2: source templates/spec-template.md#L10-L90: the file has 80 lines",
  );
  expect(run.status).toBe(1);
});

/** A root pinning speckit 1.4.3, whose 80-line spec template step 2 of the speckit feature script cites as `source`. */
function rootCitingSpecTemplate(source: string): string {
  return benchRoot({
    "pins.json": speckitPins,
    "steps/speckit/feature.yaml": scriptCitingInStep2(source),
    ".bench/tools/speckit@1.4.3/templates/spec-template.md": Array.from({ length: 80 }, (_, i) => `line ${i + 1}\n`).join(""),
  });
}

it("STEP-016 refuses the source range L20-L10, which ends before it starts", () => {
  const run = replay(rootCitingSpecTemplate("speckit@1.4.3:templates/spec-template.md#L20-L10"));

  expect(run.stderr).toContain(
    "steps/speckit/feature.yaml step 2: source templates/spec-template.md#L20-L10: not a valid line range",
  );
  expect(run.status).toBe(1);
});

it("STEP-017 refuses the source line L0, which does not exist", () => {
  const run = replay(rootCitingSpecTemplate("speckit@1.4.3:templates/spec-template.md#L0"));

  expect(run.stderr).toContain("steps/speckit/feature.yaml step 2: source templates/spec-template.md#L0: not a valid line range");
  expect(run.status).toBe(1);
});

it("STEP-018 refuses a source citing kiro, which pins.json does not pin", () => {
  const run = replay(rootCitingSpecTemplate("kiro@1.0.0:docs/spec.md"));

  expect(run.stderr).toContain("steps/speckit/feature.yaml step 2: source cites kiro, which is not pinned");
  expect(run.status).toBe(1);
});

it("STEP-019 refuses a source path outside the pinned Spec Kit install", () => {
  const root = rootCitingSpecTemplate("speckit@1.4.3:../../pins.json");
  // The path names a real file, so only leaving the install is wrong.
  writeFileSync(join(root, ".bench", "pins.json"), "{}\n");

  const run = replay(root);

  expect(run.stderr).toContain("steps/speckit/feature.yaml step 2: source ../../pins.json is outside speckit@1.4.3");
  expect(run.status).toBe(1);
});
