import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkFixtureStates } from "./fixture.ts";
import { checkPins, loadPins } from "./pins.ts";
import { replayAll } from "./replay.ts";
import { drift, resultsMarkdown } from "./report.ts";
import type { Results } from "./replay.ts";
import {
  WORKFLOWS,
  checkLoads,
  checkSessionKinds,
  checkSources,
  loadSessionSteps,
  loadSteps,
  loadTasks,
  missingScripts,
  scriptPaths,
  sessionScript,
  type Step,
} from "./steps.ts";

function check(root: string): string[] {
  const pins = loadPins(root);
  const pinErrors = checkPins(pins);
  const scripts = scriptPaths(loadTasks(root));
  const missing = missingScripts(root, scripts);
  const present = scripts.filter((script) => !missing.includes(script));
  const checked: [string, Step[]][] = [
    ...WORKFLOWS.map((workflow): [string, Step[]] => [sessionScript(workflow), loadSessionSteps(root, workflow)]),
    ...present.map((script): [string, Step[]] => [script, loadSteps(root, script)]),
  ];
  const sessionErrors = WORKFLOWS.flatMap((workflow) =>
    checkSessionKinds(sessionScript(workflow), loadSessionSteps(root, workflow)),
  );
  const stepErrors = checked.flatMap(([script, steps]) => [
    ...checkSources(script, steps),
    ...checkLoads(root, pins, script, steps),
  ]);
  return [...pinErrors, ...missing.map((script) => `missing ${script}`), ...sessionErrors, ...stepErrors];
}

/** Static checks first; the fixture's suite runs only once the scripts and pins are sound. */
function preflight(root: string): string[] {
  const staticErrors = check(root);
  if (staticErrors.length > 0) return staticErrors;
  return checkFixtureStates(root, loadTasks(root));
}

const root = process.cwd();
const errors = preflight(root);
for (const error of errors) console.error(error);
if (errors.length > 0) {
  process.exitCode = 1;
} else {
  const results = replayAll(root, loadPins(root), loadTasks(root));
  if (process.argv.includes("--check")) {
    // Compares with the committed results without writing results/.
    const committed = JSON.parse(readFileSync(join(root, "results", "results.json"), "utf8")) as Results;
    const lines = drift(committed, results);
    for (const line of lines) console.log(line);
    if (lines.length === 0) console.log("results match");
    process.exitCode = lines.length > 0 ? 1 : 0;
  } else {
    write(root, results);
  }
}

function write(root: string, results: Results): void {
  mkdirSync(join(root, "results"), { recursive: true });
  writeFileSync(join(root, "results", "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(root, "results", "results.md"), resultsMarkdown(results));
  process.exitCode = 0;
}
