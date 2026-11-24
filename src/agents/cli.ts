import { loadPins } from "../pins.ts";
import { loadTasks } from "../steps.ts";
import { checkAgentScripts } from "./scripts.ts";

const root = process.cwd();
const errors = checkAgentScripts(root, loadPins(root), loadTasks(root));
for (const error of errors) console.error(error);
if (errors.length > 0) process.exitCode = 1;
