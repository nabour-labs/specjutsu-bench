import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { agentRoot, agents, fakeBehaviour, fakeCalls, promptsYaml, realFixture } from "./agent-helpers.ts";

/** The agent results the runner wrote in `root`. */
function agentResults(root: string) {
  return JSON.parse(readFileSync(join(root, "results", "agent", "results.json"), "utf8"));
}

/** The agent results table the runner wrote in `root`. */
function agentMarkdown(root: string): string {
  return readFileSync(join(root, "results", "agent", "results.md"), "utf8");
}

/** A turn with `input` uncached input tokens and nothing else. */
function inputTurn(input: number) {
  return { turns: [{ input_tokens: input, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }] };
}

/** Every file under `dir`, recursively, as absolute paths. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

it("AGENT-004 refuses a prompt citing speckit@1.4.2 when speckit is pinned to 1.4.3", async () => {
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

  const run = await agents(root);

  expect(run.stderr).toContain(
    "agents/speckit/feature.yaml prompt 2: source cites speckit@1.4.2, but speckit is pinned to 1.4.3",
  );
  expect(run.status).toBe(1);
  expect(existsSync(join(root, "results", "agent"))).toBe(false);
});

it("AGENT-005 refuses a missing prompt script", async () => {
  const root = agentRoot({ "agents/openspec/bugfix.yaml": null });

  const run = await agents(root);

  expect(run.stderr).toContain("missing agents/openspec/bugfix.yaml");
  expect(run.status).toBe(1);
  expect(existsSync(join(root, "results", "agent"))).toBe(false);
});

it("AGENT-001 sends prompts in order, resuming the session unless a session entry comes first", async () => {
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

  const run = await agents(root, ["--runs", "1"]);

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

it("AGENT-002 gives each run a fresh, empty CLAUDE_CONFIG_DIR in its own temporary area", async () => {
  const machine = mkdtempSync(join(tmpdir(), "machine-claude-"));
  writeFileSync(join(machine, "CLAUDE.md"), "machine instructions\n");
  const root = agentRoot();

  const run = await agents(root, ["--runs", "1"], { CLAUDE_CONFIG_DIR: machine });

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

it("AGENT-003 stops the benchmark when the first speckit setup command exits 1", async () => {
  const root = agentRoot({
    "agents/speckit/setup.yaml": [
      "steps:",
      '  - command: "exit 1"',
      "    source: https://example.com/docs#setup",
      "",
    ].join("\n"),
  });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.stderr).toContain("speckit setup step 1: exited 1");
  expect(run.status).toBe(1);
  expect(existsSync(join(root, "results", "agent"))).toBe(false);
  // Only specjutsu, which runs first, reached claude: no speckit or openspec prompt was sent.
  expect(fakeCalls(root)).toHaveLength(3);
});

it("AGENT-014 passes ANTHROPIC_API_KEY to every claude call but not to setup commands", async () => {
  const root = agentRoot();
  const saw = join(root, "setup-saw.txt");
  const setup = [
    "steps:",
    `  - command: 'if [ -n "\${ANTHROPIC_API_KEY+x}" ]; then echo set; else echo unset; fi >> ${saw}'`,
    "    source: https://example.com/docs#setup",
    "",
  ].join("\n");
  for (const workflow of ["specjutsu", "speckit", "openspec"]) writeFileSync(join(root, "agents", workflow, "setup.yaml"), setup);

  const run = await agents(root, ["--runs", "1"], { ANTHROPIC_API_KEY: "sk-test" });

  expect(run.status).toBe(0);
  expect(readFileSync(saw, "utf8")).toBe("unset\n".repeat(9));
  const calls = fakeCalls(root);
  expect(calls).toHaveLength(9);
  expect(calls.map((call) => call.apiKey)).toEqual(Array(9).fill("sk-test"));
});

it("AGENT-015 the workspace is a git repo with the start state committed as fixture start", async () => {
  const root = agentRoot();

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const calls = fakeCalls(root);
  expect(calls).toHaveLength(9);
  for (const call of calls) expect(call.gitLog).toEqual(["fixture start"]);
});

it("AGENT-006 sums every turn's input tokens, cache writes and reads included", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["first", "second"]) });
  fakeBehaviour(root, {
    first: [{ turns: [{ input_tokens: 1000, cache_creation_input_tokens: 200, cache_read_input_tokens: 5000, output_tokens: 300 }] }],
    second: [{ turns: [{ input_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 6000, output_tokens: 100 }] }],
  });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const [recorded] = agentResults(root).workflows.speckit.feature.runs;
  expect(recorded.inputTokens).toBe(12600);
  expect(recorded.outputTokens).toBe(400);
});

it("AGENT-013 keeps each call's stream-json under .bench/transcripts, not under results", async () => {
  const prompts = ["change one", "change two", "change three"];
  const root = agentRoot({ "agents/openspec/change.yaml": promptsYaml(prompts) });

  const run = await agents(root, ["--runs", "2"]);

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

it("AGENT-007 marks a run failed when claude exits 1 on its second prompt, and the other runs still run", async () => {
  const prompts = ["feature one", "feature two", "feature three"];
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(prompts) });
  // Only the first run's second call exits 1.
  fakeBehaviour(root, { "feature two": [{ exit: 1 }] });

  const run = await agents(root, ["--runs", "3"]);

  expect(run.status).toBe(0);
  const runs = agentResults(root).workflows.speckit.feature.runs;
  expect(runs.map((r: { outcome: string; reason?: string }) => [r.outcome, r.reason])).toEqual([
    ["failed", "prompt 2: claude exited 1"],
    ["passed", undefined],
    ["passed", undefined],
  ]);
  // The failed run sent no third prompt; the other two sent all three.
  const sent = fakeCalls(root).map((call) => call.argv[1]);
  expect(prompts.map((prompt) => sent.filter((p) => p === prompt).length)).toEqual([3, 3, 2]);
});

it("AGENT-007 marks a run failed when a call prints no result message", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["feature one"]) });
  fakeBehaviour(root, { "feature one": [{ noResult: true }] });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const [recorded] = agentResults(root).workflows.speckit.feature.runs;
  expect([recorded.outcome, recorded.reason]).toEqual(["failed", "prompt 1: no result message"]);
});

it("AGENT-016 fails a run whose call sleeps past --timeout 1", async () => {
  const root = agentRoot({ "agents/openspec/bugfix.yaml": promptsYaml(["slow fix"]) });
  fakeBehaviour(root, { "slow fix": [{ sleep: 5 }] });

  const run = await agents(root, ["--runs", "1", "--timeout", "1"]);

  expect(run.status).toBe(0);
  const [recorded] = agentResults(root).workflows.openspec.bugfix.runs;
  expect([recorded.outcome, recorded.reason]).toEqual(["failed", "prompt 1: claude timed out after 1s"]);
});

it("AGENT-008 fails a bugfix run that leaves src/invoice.ts unchanged, as the golden bulk-discount test fails", async () => {
  const root = agentRoot({ ...realFixture("bugfix"), "agents/speckit/bugfix.yaml": promptsYaml(["fix the discount"]) });
  // The first run changes nothing; the second writes the golden fix, so the same check passes it.
  fakeBehaviour(root, {
    "fix the discount": [
      inputTurn(50000),
      { ...inputTurn(20000), copy: { from: join(root, "fixture", "golden", "bugfix", "src"), to: "src" } },
    ],
  });

  const run = await agents(root, ["--runs", "2"]);

  expect(run.status).toBe(0);
  const runs = agentResults(root).workflows.speckit.bugfix.runs;
  expect(runs.map((r: { outcome: string; reason?: string }) => [r.outcome, r.reason])).toEqual([
    ["failed", "acceptance tests failed"],
    ["passed", undefined],
  ]);
  // The failed run's 50,000 tokens are in neither the median nor the range.
  expect(agentMarkdown(root)).toContain("| speckit | bugfix | 1/2 | 20,000 | 20,000–20,000 |");
});

it("AGENT-009 shows a cell's pass rate, median and range over three passing runs", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["feature cell"]) });
  fakeBehaviour(root, { "feature cell": [inputTurn(30000), inputTurn(10000), inputTurn(12000)] });

  const run = await agents(root, ["--runs", "3"]);

  expect(run.status).toBe(0);
  expect(agentMarkdown(root)).toContain("| speckit | feature | 3/3 | 12,000 | 10,000–30,000 |");
});

it("AGENT-010 leaves a failed run out of the cell's median", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["feature cell"]) });
  fakeBehaviour(root, { "feature cell": [{ ...inputTurn(9000), exit: 1 }, inputTurn(14000), inputTurn(11000)] });

  const run = await agents(root, ["--runs", "3"]);

  expect(run.status).toBe(0);
  expect(agentMarkdown(root)).toContain("| speckit | feature | 2/3 | 11,000 | 11,000–14,000 |");
});

it("AGENT-011 compares total input tokens: specjutsu saves 60% vs speckit, 50% vs openspec", async () => {
  // Each workflow sends one prompt per task, in the order feature, bugfix, change.
  const medians: Record<string, number[]> = {
    specjutsu: [10000, 10000, 20000],
    speckit: [30000, 30000, 40000],
    openspec: [20000, 20000, 40000],
  };
  const files: Record<string, string> = {};
  for (const workflow of Object.keys(medians)) {
    for (const task of ["feature", "bugfix", "change"]) files[`agents/${workflow}/${task}.yaml`] = promptsYaml([`${workflow} task`]);
  }
  const root = agentRoot(files);
  fakeBehaviour(root, Object.fromEntries(Object.entries(medians).map(([workflow, tokens]) => [`${workflow} task`, tokens.map(inputTurn)])));

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const markdown = agentMarkdown(root);
  expect(markdown).toContain("| specjutsu | total | | 40,000 | |");
  expect(markdown).toContain("| speckit | total | | 100,000 | |");
  expect(markdown).toContain("| openspec | total | | 80,000 | |");
  expect(markdown).toContain("specjutsu saves 60% vs speckit, 50% vs openspec\n");
});

it("AGENT-012 gives speckit no total when every speckit/feature run fails, and the headline names that cell", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["speckit feature"]) });
  fakeBehaviour(root, { "speckit feature": [{ exit: 1 }, { exit: 1 }] });

  const run = await agents(root, ["--runs", "2"]);

  expect(run.status).toBe(0);
  const markdown = agentMarkdown(root);
  expect(markdown).toContain("| speckit | total | | — | |");
  // Every other cell's runs report 100 input tokens, so specjutsu and openspec tie.
  expect(markdown).toContain("specjutsu saves speckit/feature: no passing run, 0% vs openspec\n");
});

it("AGENT-017 counts the lines of one message as one turn", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["one call"]) });
  const line = (id: string, input: number, output: number) => ({
    id,
    input_tokens: input,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: output,
  });
  fakeBehaviour(root, {
    "one call": [{ turns: [line("msg-a", 1000, 50), line("msg-a", 1000, 50), line("msg-a", 1000, 50), line("msg-b", 2000, 80)] }],
  });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const [recorded] = agentResults(root).workflows.speckit.feature.runs;
  expect([recorded.inputTokens, recorded.outputTokens, recorded.turns]).toEqual([3000, 130, 2]);
});
