import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { agentRoot, agents, fakeBehaviour, fakeCalls, promptsYaml } from "./agent-helpers.ts";

/** The agent results the runner wrote in `root`. */
function agentResults(root: string) {
  return JSON.parse(readFileSync(join(root, "results", "agent", "results.json"), "utf8"));
}

/** Every file under `dir`, recursively, as absolute paths. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

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

  const run = agents(root, ["--runs", "1"]);

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

  const run = agents(root, ["--runs", "1"], { CLAUDE_CONFIG_DIR: machine });

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

  const run = agents(root, ["--runs", "1"]);

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

  const run = agents(root, ["--runs", "1"], { ANTHROPIC_API_KEY: "sk-test" });

  expect(run.status).toBe(0);
  expect(readFileSync(saw, "utf8")).toBe("unset\n".repeat(9));
  const calls = fakeCalls(root);
  expect(calls).toHaveLength(9);
  expect(calls.map((call) => call.apiKey)).toEqual(Array(9).fill("sk-test"));
});

it("AGENT-015 the workspace is a git repo with the start state committed as fixture start", () => {
  const root = agentRoot();

  const run = agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const calls = fakeCalls(root);
  expect(calls).toHaveLength(9);
  for (const call of calls) expect(call.gitLog).toEqual(["fixture start"]);
});

it("AGENT-006 sums every turn's input tokens, cache writes and reads included", () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["first", "second"]) });
  fakeBehaviour(root, {
    first: [{ turns: [{ input_tokens: 1000, cache_creation_input_tokens: 200, cache_read_input_tokens: 5000, output_tokens: 300 }] }],
    second: [{ turns: [{ input_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 6000, output_tokens: 100 }] }],
  });

  const run = agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const [recorded] = agentResults(root).workflows.speckit.feature.runs;
  expect(recorded.inputTokens).toBe(12600);
  expect(recorded.outputTokens).toBe(400);
});

it("AGENT-013 keeps each call's stream-json under .bench/transcripts, not under results", () => {
  const prompts = ["change one", "change two", "change three"];
  const root = agentRoot({ "agents/openspec/change.yaml": promptsYaml(prompts) });

  const run = agents(root, ["--runs", "2"]);

  expect(run.status).toBe(0);
  // The second run's calls are the second three with these prompts.
  const second = fakeCalls(root).filter((call) => prompts.includes(call.argv[1])).slice(3);
  expect(second.map((call) => call.argv[1])).toEqual(prompts);
  const dir = join(root, ".bench", "transcripts", "openspec", "change", "run-2");
  expect(readdirSync(dir).sort()).toEqual(["prompt-1.jsonl", "prompt-2.jsonl", "prompt-3.jsonl"]);
  second.forEach((call, i) => {
    const lines = readFileSync(join(dir, `prompt-${i + 1}.jsonl`), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    expect(lines.map((line) => line.type)).toEqual(["system", "assistant", "result"]);
    expect(lines.every((line) => line.session_id === call.sessionId)).toBe(true);
  });
  const results = filesUnder(join(root, "results"));
  expect(results.length).toBeGreaterThan(0);
  for (const file of results) expect(readFileSync(file, "utf8")).not.toContain('"type":"assistant"');
});
