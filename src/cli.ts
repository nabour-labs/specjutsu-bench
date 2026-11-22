import { checkPins, loadPins } from "./pins.ts";

const errors = checkPins(loadPins(process.cwd()));
for (const error of errors) console.error(error);
process.exitCode = errors.length > 0 ? 1 : 0;
