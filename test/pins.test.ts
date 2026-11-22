import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const pkg = fileURLToPath(new URL("..", import.meta.url));

it("STEP-003 refuses a version range", () => {
  const root = mkdtempSync(join(tmpdir(), "replay-"));
  writeFileSync(join(root, "pins.json"), JSON.stringify({ openspec: "^1.2" }));

  const run = spawnSync("npm", ["run", "--silent", "--prefix", pkg, "replay"], {
    cwd: root,
    encoding: "utf8",
  });

  expect(run.stdout + run.stderr).toContain('pin openspec: "^1.2" is not an exact version');
  expect(run.status).toBe(1);
});
