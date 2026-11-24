import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { agentRoot, agents, fakeCalls } from "./agent-helpers.ts";

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

it("AGENT-001 sends prompts in order, resuming the session unless a session entry comes first", () => {
  const root = agentRoot({
    "agents/speckit/feature.yaml": [
      "prompts:",
      '  - prompt: "prompt A"',
      "    source: https://example.com/docs#a",
      '  - prompt: "prompt B"',
      "    source: https://example.com/docs#b",
      "  - session: true",
      "    source: https://example.com/docs#new-session",
      '  - prompt: "prompt C"',
      "    source: https://example.com/docs#c",
      "",
    ].join("\n"),
  });

  const run = agents(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const calls = fakeCalls(root).filter((call) => ["prompt A", "prompt B", "prompt C"].includes(call.argv[1]));
  const base = (prompt: string) => [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    "claude-sonnet-5-5",
    "--permission-mode",
    "bypassPermissions",
  ];
  expect(calls.map((call) => call.argv)).toEqual([
    base("prompt A"),
    [...base("prompt B"), "--resume", calls[0]?.sessionId],
    base("prompt C"),
  ]);
});

it("AGENT-002 gives each run a fresh, empty CLAUDE_CONFIG_DIR in its own temporary area", () => {
  const machine = mkdtempSync(join(tmpdir(), "machine-claude-"));
  writeFileSync(join(machine, "CLAUDE.md"), "machine instructions\n");
  const root = agentRoot();

  const run = agents(root, [], { CLAUDE_CONFIG_DIR: machine });

  expect(run.status).toBe(0);
  const calls = fakeCalls(root);
  // One call per workflow per task, each in its own run.
  expect(calls).toHaveLength(9);
  for (const call of calls) {
    expect(call.config?.path).not.toBe(machine);
    expect(call.config?.entries).toEqual([]);
    // The config dir sits beside the run's workspace, in the run's temporary area.
    expect(dirname(call.config?.path ?? "")).toBe(dirname(call.cwd));
    expect(existsSync(call.config?.path ?? "")).toBe(false);
  }
  expect(new Set(calls.map((call) => call.config?.path)).size).toBe(9);
});

it("AGENT-003 stops the benchmark when the first speckit setup command exits 1", () => {
  const root = agentRoot({
    "agents/speckit/setup.yaml": [
      "steps:",
      '  - command: "exit 1"',
      "    source: https://example.com/docs#setup",
      "",
    ].join("\n"),
  });

  const run = agents(root);

  expect(run.stderr).toContain("speckit setup step 1: exited 1");
  expect(run.status).toBe(1);
  expect(existsSync(join(root, "results", "agent"))).toBe(false);
  // Only specjutsu, which runs first, reached claude: no speckit or openspec prompt was sent.
  expect(fakeCalls(root)).toHaveLength(3);
});

it("AGENT-014 passes ANTHROPIC_API_KEY to every claude call but not to setup commands", () => {
  const root = agentRoot();
  const saw = join(root, "setup-saw.txt");
  const setup = [
    "steps:",
    `  - command: 'if [ -n "\${ANTHROPIC_API_KEY+x}" ]; then echo set; else echo unset; fi >> ${saw}'`,
    "    source: https://example.com/docs#setup",
    "",
  ].join("\n");
  for (const workflow of ["specjutsu", "speckit", "openspec"]) writeFileSync(join(root, "agents", workflow, "setup.yaml"), setup);

  const run = agents(root, [], { ANTHROPIC_API_KEY: "sk-test" });

  expect(run.status).toBe(0);
  expect(readFileSync(saw, "utf8")).toBe("unset\n".repeat(9));
  const calls = fakeCalls(root);
  expect(calls).toHaveLength(9);
  expect(calls.map((call) => call.apiKey)).toEqual(Array(9).fill("sk-test"));
});

it("AGENT-015 the workspace is a git repo with the start state committed as fixture start", () => {
  const root = agentRoot();

  const run = agents(root);

  expect(run.status).toBe(0);
  const calls = fakeCalls(root);
  expect(calls).toHaveLength(9);
  for (const call of calls) expect(call.gitLog).toEqual(["fixture start"]);
});
