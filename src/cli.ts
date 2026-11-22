import { checkPins, loadPins } from "./pins.ts";
import { missingScripts, checkSources, loadSteps, loadTasks, scriptPaths } from "./steps.ts";

function check(root: string): string[] {
  const pinErrors = checkPins(loadPins(root));
  const scripts = scriptPaths(loadTasks(root));
  const missing = missingScripts(root, scripts);
  const present = scripts.filter((script) => !missing.includes(script));
  const sourceErrors = present.flatMap((script) => checkSources(script, loadSteps(root, script)));
  return [...pinErrors, ...missing.map((script) => `missing ${script}`), ...sourceErrors];
}

const errors = check(process.cwd());
for (const error of errors) console.error(error);
process.exitCode = errors.length > 0 ? 1 : 0;
