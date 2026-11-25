import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadPins } from "../pins.ts";
import { StartCommitError } from "../replay.ts";
import { loadTasks, WORKFLOWS } from "../steps.ts";
import { agentResults, resultsMarkdown } from "./results.ts";
import { checkRunnable, runAll, SetupError } from "./run.ts";
import { fingerprints, saveRun, savedRun, savedRuns } from "./saved.ts";
import { checkAgentScripts, loadAgentConfig } from "./scripts.ts";

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "3" },
    timeout: { type: "string", default: "1800" },
    workflow: { type: "string" },
    fresh: { type: "boolean", default: false },
  },
});
/** A whole number of at least 1, or undefined for anything else. */
function positiveInteger(value: string | undefined): number | undefined {
  return value !== undefined && /^[1-9][0-9]*$/.test(value) ? Number(value) : undefined;
}

const runCount = positiveInteger(values.runs);
const timeout = positiveInteger(values.timeout);
// The workflows this start runs: the one --workflow names, or all of them.
const workflows: readonly string[] = values.workflow === undefined ? WORKFLOWS : [values.workflow];
const root = process.cwd();
const tasks = loadTasks(root);
const pins = loadPins(root);
// Everything is checked before the first run, so a refused start runs nothing and writes no results.
const errors = [
  ...(runCount === undefined ? ["--runs must be a positive integer"] : []),
  ...(timeout === undefined ? ["--timeout must be a positive integer"] : []),
  ...(workflows.every((workflow) => (WORKFLOWS as readonly string[]).includes(workflow))
    ? []
    : [`--workflow must be one of ${WORKFLOWS.join(", ")}`]),
  ...checkRunnable(root, tasks),
  ...checkAgentScripts(root, pins, tasks),
];
for (const error of errors) console.error(error);
if (errors.length > 0 || runCount === undefined || timeout === undefined) {
  process.exitCode = 1;
} else {
  const { model } = loadAgentConfig(root);
  const dir = join(root, "results", "agent");
  // What results/agent held before the first run, put back if the pass stops on an error.
  const earlier = existsSync(dir) ? readdirSync(dir).map((name) => [name, readFileSync(join(dir, name))] as const) : undefined;
  // Each cell's inputs, hashed once: a run saved with its cell's fingerprint is not run again.
  const prints = fingerprints(root, model, tasks);
  // The results are rewritten from the saved runs, so they never show a run 1 to --runs doesn't cover.
  const writeResults = () => {
    const results = agentResults(model, pins, savedRuns(root, prints, runCount));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(join(dir, "results.md"), resultsMarkdown(results));
  };
  try {
    const saved = (workflow: string, task: string, n: number) => savedRun(root, workflow, task, n, prints[workflow][task]) !== undefined;
    runAll(root, tasks, { workflows, runs: runCount, timeout }, saved, (workflow, task, n, { run, errored }) => {
      if (errored) {
        console.error(`${workflow}/${task} run ${n}: ${run.reason} (not saved, will be retried)`);
        return;
      }
      saveRun(root, workflow, task, n, run, prints[workflow][task]);
      // Rewritten after every run, so a stopped pass loses none.
      writeResults();
    });
    // And once more at the end, so a start with every run already saved still reports runs 1 to --runs.
    writeResults();
  } catch (error) {
    if (!(error instanceof SetupError || error instanceof StartCommitError)) throw error;
    console.error(error.message);
    rmSync(dir, { recursive: true, force: true });
    if (earlier !== undefined) {
      mkdirSync(dir, { recursive: true });
      for (const [name, bytes] of earlier) writeFileSync(join(dir, name), bytes);
    }
    process.exitCode = 1;
  }
}
