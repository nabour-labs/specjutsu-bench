import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkPins, loadPins } from "./pins.ts";
import { replayAll } from "./replay.ts";
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

const root = process.cwd();
const errors = check(root);
for (const error of errors) console.error(error);
if (errors.length > 0) {
  process.exitCode = 1;
} else {
  const results = replayAll(root, loadPins(root), loadTasks(root));
  mkdirSync(join(root, "results"), { recursive: true });
  writeFileSync(join(root, "results", "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  process.exitCode = 0;
}
