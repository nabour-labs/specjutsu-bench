import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadPins } from "../pins.ts";
import { StartCommitError } from "../replay.ts";
import { loadTasks } from "../steps.ts";
import { runAll, SetupError } from "./run.ts";
import { checkAgentScripts, loadAgentConfig } from "./scripts.ts";

const { values } = parseArgs({
  options: { runs: { type: "string", default: "3" }, timeout: { type: "string", default: "1800" } },
});
const root = process.cwd();
const tasks = loadTasks(root);
const pins = loadPins(root);
const errors = checkAgentScripts(root, pins, tasks);
for (const error of errors) console.error(error);
if (errors.length > 0) {
  process.exitCode = 1;
} else {
  try {
    const runs = runAll(root, tasks, { runs: Number(values.runs), timeout: Number(values.timeout) });
    const workflows = Object.fromEntries(
      Object.entries(runs).map(([workflow, cells]) => [
        workflow,
        Object.fromEntries(Object.entries(cells).map(([task, cellRuns]) => [task, { runs: cellRuns }])),
      ]),
    );
    const dir = join(root, "results", "agent");
    mkdirSync(dir, { recursive: true });
    const results = { model: loadAgentConfig(root).model, pins, workflows };
    writeFileSync(join(dir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  } catch (error) {
    if (!(error instanceof SetupError || error instanceof StartCommitError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
