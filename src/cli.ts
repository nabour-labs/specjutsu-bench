import { checkPins, loadPins } from "./pins.ts";
import { missingScripts, checkLoads, checkSources, loadSteps, loadTasks, scriptPaths } from "./steps.ts";

function check(root: string): string[] {
  const pins = loadPins(root);
  const pinErrors = checkPins(pins);
  const scripts = scriptPaths(loadTasks(root));
  const missing = missingScripts(root, scripts);
  const present = scripts.filter((script) => !missing.includes(script));
  const stepErrors = present.flatMap((script) => {
    const steps = loadSteps(root, script);
    return [...checkSources(script, steps), ...checkLoads(root, pins, script, steps)];
  });
  return [...pinErrors, ...missing.map((script) => `missing ${script}`), ...stepErrors];
}

const errors = check(process.cwd());
for (const error of errors) console.error(error);
process.exitCode = errors.length > 0 ? 1 : 0;
