import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkPins, loadPins } from "./pins.ts";
import { replayAll } from "./replay.ts";
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
