import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadPins } from "../pins.ts";
import { StartCommitError } from "../replay.ts";
import { loadTasks } from "../steps.ts";
import { agentResults, resultsMarkdown } from "./results.ts";
import { checkRunnable, runAll, SetupError } from "./run.ts";
import { checkAgentScripts, loadAgentConfig } from "./scripts.ts";

const { values } = parseArgs({
  options: { runs: { type: "string", default: "3" }, timeout: { type: "string", default: "1800" } },
});
/** A whole number of at least 1, or undefined for anything else. */
function positiveInteger(value: string | undefined): number | undefined {
  return value !== undefined && /^[1-9][0-9]*$/.test(value) ? Number(value) : undefined;
}

const runCount = positiveInteger(values.runs);
const timeout = positiveInteger(values.timeout);
const root = process.cwd();
const tasks = loadTasks(root);
const pins = loadPins(root);
// Everything is checked before the first run, so a refused start runs nothing and writes no results.
const errors = [
  ...(runCount === undefined ? ["--runs must be a positive integer"] : []),
  ...(timeout === undefined ? ["--timeout must be a positive integer"] : []),
  ...checkRunnable(root, tasks),
  ...checkAgentScripts(root, pins, tasks),
];
for (const error of errors) console.error(error);
if (errors.length > 0 || runCount === undefined || timeout === undefined) {
  process.exitCode = 1;
} else {
  try {
    const runs = runAll(root, tasks, { runs: runCount, timeout });
    // Results are written only once every run is done.
    const results = agentResults(loadAgentConfig(root).model, pins, runs);
    const dir = join(root, "results", "agent");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(join(dir, "results.md"), resultsMarkdown(results));
  } catch (error) {
    if (!(error instanceof SetupError || error instanceof StartCommitError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
