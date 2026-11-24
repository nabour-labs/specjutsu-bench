import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Pins = Record<string, string>;

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const COMMIT = /^[0-9a-f]{40}$/;

export function loadPins(root: string): Pins {
  return JSON.parse(readFileSync(join(root, "pins.json"), "utf8")) as Pins;
}

/** Returns one error line per pin that is not an exact version or commit. */
export function checkPins(pins: Pins): string[] {
  return Object.entries(pins)
    .filter(([, version]) => !SEMVER.test(version) && !COMMIT.test(version))
    .map(([tool, version]) => `pin ${tool}: ${JSON.stringify(version)} is not an exact version`);
}
