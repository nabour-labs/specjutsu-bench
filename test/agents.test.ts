import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

it("AGENT-014 setup commands never see the API key, and every claude call sees sk-test", async () => {
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

it("AGENT-018 names specjutsu/feature once in the headline when every specjutsu/feature run fails", async () => {
  const root = agentRoot({ "agents/specjutsu/feature.yaml": promptsYaml(["specjutsu feature"]) });
  fakeBehaviour(root, { "specjutsu feature": [{ exit: 1 }] });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const lines = agentMarkdown(root).trimEnd().split("\n");
  expect(lines.at(-1)).toBe("specjutsu/feature: no passing run");
  expect(lines.filter((line) => line.includes("no passing run"))).toHaveLength(1);
});

/** A root whose `results/agent/results.json` holds earlier results, to check a refused start leaves them alone. */
function rootWithEarlierResults(files: Record<string, string | null> = {}): string {
  return agentRoot({ "results/agent/results.json": '{"earlier": true}\n', ...files });
}

function expectEarlierResults(root: string): void {
  expect(readdirSync(join(root, "results", "agent"))).toEqual(["results.json"]);
  expect(readFileSync(join(root, "results", "agent", "results.json"), "utf8")).toBe('{"earlier": true}\n');
}

it("AGENT-019 refuses --runs 0 before any claude call", async () => {
  const root = rootWithEarlierResults();

  const run = await agents(root, ["--runs", "0"]);

  expect(run.stderr).toContain("--runs must be a positive integer");
  expect(run.status).toBe(1);
  expect(fakeCalls(root)).toEqual([]);
  expectEarlierResults(root);
});

it("AGENT-020 refuses --timeout abc before any setup command", async () => {
  const root = rootWithEarlierResults();
  const marker = join(root, "setup-ran.txt");
  for (const workflow of ["specjutsu", "speckit", "openspec"]) {
    writeFileSync(join(root, "agents", workflow, "setup.yaml"), `steps:\n  - command: "touch ${marker}"\n    source: https://example.com/docs#setup\n`);
  }

  const run = await agents(root, ["--runs", "1", "--timeout", "abc"]);

  expect(run.stderr).toContain("--timeout must be a positive integer");
  expect(run.status).toBe(1);
  expect(existsSync(marker)).toBe(false);
  expectEarlierResults(root);
});

it("AGENT-021 stops when no claude is on PATH", async () => {
  const root = rootWithEarlierResults();
  // PATH holds node and npm, and the system tools, but no claude: neither the fake nor a real one.
  const dirs = [dirname(process.execPath), "/usr/bin", "/bin"];
  for (const dir of dirs) expect(existsSync(join(dir, "claude"))).toBe(false);

  const run = await agents(root, ["--runs", "1"], { PATH: dirs.join(delimiter) });

  expect(run.stderr).toContain("claude not found on PATH");
  expect(run.status).toBe(1);
  expect(fakeCalls(root)).toEqual([]);
  expectEarlierResults(root);
});

it("AGENT-022 refuses a task without golden tests", async () => {
  const root = agentRoot({ "fixture/golden/change/test/README.md": null });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.stderr).toContain("fixture/golden/change/test: missing");
  expect(run.status).toBe(1);
});

it("AGENT-023 gives each run its own fresh home, with what setup installs in $HOME/.local/bin on claude's PATH", async () => {
  const root = agentRoot();
  // The runner's own home is a throwaway, so a setup command that wrote there can't touch the real one.
  const machineHome = mkdtempSync(join(tmpdir(), "machine-home-"));
  const homeEntries = join(root, "home-entries.txt");
  const setup = [
    "steps:",
    "  - command: |",
    `      ls -A "$HOME" | wc -l | tr -d ' ' >> ${homeEntries}`,
    '      mkdir -p "$HOME/.local/bin"',
    `      printf '#!/bin/sh\\necho hello from home\\n' > "$HOME/.local/bin/hello"`,
    '      chmod +x "$HOME/.local/bin/hello"',
    "    source: https://example.com/docs#setup",
    "",
  ].join("\n");
  for (const workflow of ["specjutsu", "speckit", "openspec"]) writeFileSync(join(root, "agents", workflow, "setup.yaml"), setup);

  const run = await agents(root, ["--runs", "1"], { HOME: machineHome });

  expect(run.status).toBe(0);
  expect(existsSync(join(machineHome, ".local", "bin", "hello"))).toBe(false);
  // Every home was empty when setup started.
  expect(readFileSync(homeEntries, "utf8")).toBe("0\n".repeat(9));
  const calls = fakeCalls(root);
  expect(calls).toHaveLength(9);
  for (const call of calls) {
    expect(call.home).not.toBe(machineHome);
    // The home sits beside the run's workspace, in the run's temporary area, removed afterwards.
    expect(dirname(call.home ?? "")).toBe(dirname(call.cwd));
    expect(existsSync(call.home ?? "")).toBe(false);
    expect(call.helloOutput).toBe("hello from home\n");
  }
  expect(new Set(calls.map((call) => call.home)).size).toBe(9);
});

it("AGENT-024 counts a subagent's turns like the agent's own", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["with a subagent"]) });
  const line = (input: number, parent?: string) => ({
    parent,
    input_tokens: input,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 0,
  });
  fakeBehaviour(root, { "with a subagent": [{ turns: [line(1000), line(4000, "toolu_task"), line(6000, "toolu_task")] }] });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const [recorded] = agentResults(root).workflows.speckit.feature.runs;
  expect([recorded.inputTokens, recorded.turns]).toEqual([11000, 3]);
});

it("AGENT-025 a run that writes node_modules/.agent-was-here changes neither the bench's node_modules nor the next run's", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["touch the packages"]) });
  const marker = "node_modules/.agent-was-here";
  fakeBehaviour(root, { "touch the packages": [{ write: marker }, { look: marker }] });
  // A test root's node_modules links to this package's own, so a shared one would be written here.
  const real = join(fileURLToPath(new URL("..", import.meta.url)), marker);
  try {
    const run = await agents(root, ["--runs", "2"]);

    expect(run.status).toBe(0);
    expect(existsSync(join(root, marker))).toBe(false);
    const second = fakeCalls(root).filter((call) => call.argv[1] === "touch the packages")[1];
    expect(second?.looked).toBe(false);
  } finally {
    rmSync(real, { force: true });
  }
});

it("AGENT-026 the agent can commit, as bench <bench@localhost>", async () => {
  const root = agentRoot();
  fakeBehaviour(root, { "prompt 1": Array(9).fill({ commit: true }) });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const calls = fakeCalls(root);
  expect(calls).toHaveLength(9);
  for (const call of calls) expect(call.commit).toEqual({ status: 0, author: "bench <bench@localhost>" });
});

it("AGENT-027 replaces the API key with [redacted] in a saved transcript", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["leak the key"]) });
  fakeBehaviour(root, { "leak the key": [{ print: "the key is sk-test-123" }] });

  const run = await agents(root, ["--runs", "1"], { ANTHROPIC_API_KEY: "sk-test-123" });

  expect(run.status).toBe(0);
  const transcript = readFileSync(join(root, ".bench", "transcripts", "speckit", "feature", "run-1", "prompt-1.jsonl"), "utf8");
  expect(transcript).toContain("the key is [redacted]\n");
  expect(transcript).not.toContain("sk-test-123");
});

it("AGENT-028 stops when ANTHROPIC_API_KEY is not set", async () => {
  const root = rootWithEarlierResults();

  const run = await agents(root, ["--runs", "1"], { ANTHROPIC_API_KEY: undefined });

  expect(run.stderr).toContain("ANTHROPIC_API_KEY is not set");
  expect(run.status).toBe(1);
  expect(fakeCalls(root)).toEqual([]);
  expectEarlierResults(root);
});

it("AGENT-029 records a message's largest usage on any of its lines", async () => {
  const root = agentRoot({ "agents/speckit/feature.yaml": promptsYaml(["one message"]) });
  const line = (output: number) => ({
    id: "m1",
    input_tokens: 1000,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: output,
  });
  fakeBehaviour(root, { "one message": [{ turns: [line(10), line(50)] }] });

  const run = await agents(root, ["--runs", "1"]);

  expect(run.status).toBe(0);
  const [recorded] = agentResults(root).workflows.speckit.feature.runs;
  expect([recorded.inputTokens, recorded.outputTokens, recorded.turns]).toEqual([1000, 50, 1]);
});
