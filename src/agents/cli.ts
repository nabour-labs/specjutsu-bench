import { loadPins } from "../pins.ts";
import { StartCommitError } from "../replay.ts";
import { loadTasks } from "../steps.ts";
import { runAll, SetupError } from "./run.ts";
import { checkAgentScripts } from "./scripts.ts";

const root = process.cwd();
const tasks = loadTasks(root);
const errors = checkAgentScripts(root, loadPins(root), tasks);
for (const error of errors) console.error(error);
if (errors.length > 0) {
  process.exitCode = 1;
} else {
  try {
    runAll(root, tasks);
  } catch (error) {
    if (!(error instanceof SetupError || error instanceof StartCommitError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
