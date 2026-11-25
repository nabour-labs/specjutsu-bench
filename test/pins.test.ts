import { expect, it } from "vitest";
import { benchRoot, replay } from "./helpers.ts";

it("STEP-003 refuses a version range", async () => {
  const root = benchRoot({ "pins.json": JSON.stringify({ openspec: "^1.2" }) });

  const run = await replay(root);

  expect(run.stdout + run.stderr).toContain('pin openspec: "^1.2" is not an exact version');
  expect(run.status).toBe(1);
});
