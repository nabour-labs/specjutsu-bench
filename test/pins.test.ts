import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const pkg = fileURLToPath(new URL("..", import.meta.url));

/** A throwaway benchmark root: this package's script and sources plus the given pins. */
function benchRoot(pins: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "replay-"));
  cpSync(join(pkg, "package.json"), join(root, "package.json"));
  cpSync(join(pkg, "src"), join(root, "src"), { recursive: true });
  writeFileSync(join(root, "pins.json"), JSON.stringify(pins));
  return root;
}

it("STEP-003 refuses a version range", () => {
  const root = benchRoot({ openspec: "^1.2" });

  const run = spawnSync("npm", ["run", "--silent", "replay"], { cwd: root, encoding: "utf8" });

  expect(run.stdout + run.stderr).toContain('pin openspec: "^1.2" is not an exact version');
  expect(run.status).toBe(1);
});
