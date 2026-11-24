import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { agentRoot, agents } from "./agent-helpers.ts";

it("AGENT-004 refuses a prompt citing speckit@1.4.2 when speckit is pinned to 1.4.3", () => {
  const root = agentRoot({
    "pins.json": JSON.stringify({ speckit: "1.4.3" }),
    "agents/speckit/feature.yaml": [
      "prompts:",
      '  - prompt: "/speckit.specify Add payment terms"',
      "    source: speckit@1.4.3:templates/commands/specify.md",
      '  - prompt: "/speckit.plan"',
      "    source: speckit@1.4.2:templates/commands/plan.md",
      "",
    ].join("\n"),
    // Both versions hold the files, so only the version mismatch is wrong.
    ".bench/tools/speckit@1.4.3/templates/commands/specify.md": "specify\n",
    ".bench/tools/speckit@1.4.2/templates/commands/plan.md": "plan\n",
    ".bench/tools/speckit@1.4.3/templates/commands/plan.md": "plan\n",
  });

  const run = agents(root);

  expect(run.stderr).toContain(
    "agents/speckit/feature.yaml prompt 2: source cites speckit@1.4.2, but speckit is pinned to 1.4.3",
  );
  expect(run.status).toBe(1);
  expect(existsSync(join(root, "results", "agent"))).toBe(false);
});

it("AGENT-005 refuses a missing prompt script", () => {
  const root = agentRoot({ "agents/openspec/bugfix.yaml": null });

  const run = agents(root);

  expect(run.stderr).toContain("missing agents/openspec/bugfix.yaml");
  expect(run.status).toBe(1);
  expect(existsSync(join(root, "results", "agent"))).toBe(false);
});
