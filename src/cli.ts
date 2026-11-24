import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkFixtureStates } from "./fixture.ts";
import { checkPins, loadPins } from "./pins.ts";
import { replayAll, RunStepError, StartCommitError } from "./replay.ts";
import { drift, gainMismatches, resultsMarkdown } from "./report.ts";
import type { Gain, Results } from "./replay.ts";
import {
  WORKFLOWS,
  checkCitations,
  checkLoads,
  checkPaths,
  checkSessionKinds,
  checkSjRuns,
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
    ...checkCitations(root, pins, script, steps),
    ...checkLoads(root, pins, script, steps),
    ...checkPaths(root, script, steps),
    ...checkSjRuns(root, pins, script, steps),
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
  try {
    if (process.argv.includes("--check")) {
      checkDrift(root);
    } else {
      const { results, gain } = replayAll(root, loadPins(root), loadTasks(root));
      if (reportGain(gain)) write(root, results);
      else process.exitCode = 1;
    }
  } catch (error) {
    if (!(error instanceof StartCommitError || error instanceof RunStepError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}

/** Compares a fresh replay with the committed results without writing results/. */
function checkDrift(root: string): void {
  const committedPath = join(root, "results", "results.json");
  if (!existsSync(committedPath)) {
    console.error("results/results.json: missing");
    process.exitCode = 1;
    return;
  }
  const committed = readResults(committedPath);
  if (!committed) {
    console.error("results/results.json: unreadable");
    process.exitCode = 1;
    return;
  }
  const { results, gain } = replayAll(root, loadPins(root), loadTasks(root));
  const gainOk = reportGain(gain);
  const lines = drift(committed, results);
  for (const line of lines) console.log(line);
  if (lines.length === 0) console.log("results match");
  process.exitCode = lines.length > 0 || !gainOk ? 1 : 0;
}

/** Prints every `sj gain` failure or mismatch to stderr; true when there are none. */
function reportGain(gain: Gain): boolean {
  const lines = gainMismatches(gain);
  for (const line of lines) console.error(line);
  return lines.length === 0;
}

/** The committed results, or undefined when they are not JSON with `pins` and `workflows`. */
function readResults(path: string): Results | undefined {
  try {
    const results = JSON.parse(readFileSync(path, "utf8")) as Partial<Results> | null;
    return results && typeof results.pins === "object" && typeof results.workflows === "object"
      ? (results as Results)
      : undefined;
  } catch {
    return undefined;
  }
}

function write(root: string, results: Results): void {
  mkdirSync(join(root, "results"), { recursive: true });
  writeFileSync(join(root, "results", "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(root, "results", "results.md"), resultsMarkdown(results));
  process.exitCode = 0;
}
