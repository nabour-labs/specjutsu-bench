import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { benchRoot, replay } from "./helpers.ts";

const SUPERPOWERS = "0123456789abcdef0123456789abcdef01234567";

type Results = {
  workflows: Record<string, Record<string, { context: number; output: number; steps: { kind: string; context: number; output: number }[] }>>;
};

function results(root: string): Results {
  return JSON.parse(readFileSync(join(root, "results", "results.json"), "utf8")) as Results;
}

/** The script's own steps, without the implicit session entry the replay adds first. */
function ownSteps(script: Results["workflows"][string][string]) {
  return script.steps.filter((s) => s.kind !== "session");
}

function step(fields: string): string {
  return `  - kind: ${fields}    source: https://example.com/docs#step\n`;
}

it("REPLAY-001 records context bytes for load, read and run steps and the script total", () => {
  const script =
    "steps:\n" +
    step("load\n    tool: superpowers\n    path: skills/brainstorming/SKILL.md\n") +
    step("read\n    path: src/app.ts\n") +
    step(`run\n    command: node -e "process.stdout.write('x'.repeat(3000))"\n`);
  const root = benchRoot({
    "steps/speckit/feature.yaml": script,
    [`.bench/tools/superpowers@${SUPERPOWERS}/skills/brainstorming/SKILL.md`]: "s".repeat(1200),
    "fixture/start/src/app.ts": "a".repeat(800),
  });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const feature = results(root).workflows.speckit.feature;
  expect(ownSteps(feature).map((s) => s.context)).toEqual([1200, 800, 3000]);
  expect(feature.context).toBe(5000);
});

it("REPLAY-002 records a written golden file as output and a later read of it as context", () => {
  const script = "steps:\n" + step("write\n    path: plan.md\n") + step("read\n    path: plan.md\n");
  const root = benchRoot({
    "steps/speckit/feature.yaml": script,
    "fixture/golden/feature/plan.md": "p".repeat(2000),
  });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const [write, read] = ownSteps(results(root).workflows.speckit.feature);
  expect(write).toMatchObject({ kind: "write", output: 2000, context: 0 });
  expect(read).toMatchObject({ kind: "read", context: 2000 });
});

it("REPLAY-003 counts a 4,000-byte bootstrap at each of 2 declared sessions as two steps, 8,000 bytes", () => {
  const bootstrap = "skills/using-superpowers/SKILL.md";
  const session = "steps:\n" + step(`load\n    tool: superpowers\n    path: ${bootstrap}\n`);
  const script = "steps:\n" + step("session\n") + step("read\n    path: file-1.md\n") + step("session\n");
  const root = benchRoot({
    "steps/speckit/session.yaml": session,
    "steps/speckit/feature.yaml": script,
    [`.bench/tools/superpowers@${SUPERPOWERS}/${bootstrap}`]: "b".repeat(4000),
  });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const feature = results(root).workflows.speckit.feature;
  const sessions = feature.steps.filter((s) => s.kind === "session");
  expect(sessions).toEqual([
    { kind: "session", context: 4000, output: 0 },
    { kind: "session", context: 4000, output: 0 },
  ]);
  expect(sessions.reduce((sum, s) => sum + s.context, 0)).toBe(8000);
  // file-1.md holds "file 1\n", 7 bytes.
  expect(feature.context).toBe(8007);
});

it("REPLAY-011 records one 4,000-byte session step before the own steps of a script with no session step", () => {
  const bootstrap = "skills/using-superpowers/SKILL.md";
  const session = "steps:\n" + step(`load\n    tool: superpowers\n    path: ${bootstrap}\n`);
  const script = "steps:\n" + step("read\n    path: file-1.md\n") + step("read\n    path: file-2.md\n");
  const root = benchRoot({
    "steps/speckit/session.yaml": session,
    "steps/speckit/feature.yaml": script,
    [`.bench/tools/superpowers@${SUPERPOWERS}/${bootstrap}`]: "b".repeat(4000),
  });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const feature = results(root).workflows.speckit.feature;
  expect(feature.steps).toEqual([
    { kind: "session", context: 4000, output: 0 },
    { kind: "read", path: "file-1.md", context: 7, output: 0 },
    { kind: "read", path: "file-2.md", context: 7, output: 0 },
  ]);
});

it("REPLAY-009 refuses a bugfix golden end state whose tests fail, replaying no script", () => {
  // The fixture's suite fails when broken.txt is present; only the bugfix golden dir adds it.
  const root = benchRoot({
    "fixture/tasks.json": JSON.stringify({ tasks: ["feature", "bugfix", "change"], test: "node check.mjs" }),
    "fixture/start/check.mjs": `import { existsSync } from "node:fs";\nprocess.exit(existsSync("broken.txt") ? 1 : 0);\n`,
    "fixture/golden/bugfix/broken.txt": "broken\n",
    "results/results.json": "previous\n",
  });

  const run = replay(root);

  expect(run.stderr.trim()).toBe("fixture bugfix end state: tests fail");
  expect(run.status).toBe(1);
  expect(readFileSync(join(root, "results", "results.json"), "utf8")).toBe("previous\n");
});

/** One read step per task, each reading a start file of the given size. */
function sizedScripts(sizes: Record<string, Record<string, number>>): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [workflow, tasks] of Object.entries(sizes)) {
    for (const [task, size] of Object.entries(tasks)) {
      files[`steps/${workflow}/${task}.yaml`] = "steps:\n" + step(`read\n    path: ${workflow}-${task}.md\n`);
      files[`fixture/start/${workflow}-${task}.md`] = "x".repeat(size);
    }
  }
  return files;
}

it("REPLAY-004 shows per-task rows, totals of 10,000, 40,000 and 25,000 and the saving in results.md", () => {
  const root = benchRoot(
    sizedScripts({
      specjutsu: { feature: 2000, bugfix: 3000, change: 5000 },
      speckit: { feature: 10000, bugfix: 10000, change: 20000 },
      openspec: { feature: 5000, bugfix: 10000, change: 10000 },
    }),
  );

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const lines = readFileSync(join(root, "results", "results.md"), "utf8").split("\n");
  for (const row of [
    "| specjutsu | feature | 2000 | 500 | 0 |",
    "| specjutsu | bugfix | 3000 | 750 | 0 |",
    "| specjutsu | change | 5000 | 1250 | 0 |",
    "| speckit | feature | 10000 | 2500 | 0 |",
    "| speckit | bugfix | 10000 | 2500 | 0 |",
    "| speckit | change | 20000 | 5000 | 0 |",
    "| openspec | feature | 5000 | 1250 | 0 |",
    "| openspec | bugfix | 10000 | 2500 | 0 |",
    "| openspec | change | 10000 | 2500 | 0 |",
  ]) {
    expect(lines).toContain(row);
  }
  expect(lines).toContain("| specjutsu | total | 10000 | 2500 | 0 |");
  expect(lines).toContain("| speckit | total | 40000 | 10000 | 0 |");
  expect(lines).toContain("| openspec | total | 25000 | 6250 | 0 |");
  expect(lines).toContain("specjutsu saves 75% vs speckit, 60% vs openspec");
});

it("REPLAY-005 writes byte-identical results.json and results.md on two runs", () => {
  const root = benchRoot({
    "steps/speckit/feature.yaml":
      "steps:\n" + step("write\n    path: plan.md\n") + step("read\n    path: plan.md\n") +
      step(`run\n    command: node -e "process.stdout.write('ok')"\n`),
    "fixture/golden/feature/plan.md": "plan\n",
  });
  const files = ["results.json", "results.md"];
  const read = () => files.map((file) => readFileSync(join(root, "results", file)));

  expect(replay(root).status).toBe(0);
  const first = read();
  expect(replay(root).status).toBe(0);
  const second = read();

  for (const [i, file] of files.entries()) {
    expect(second[i].equals(first[i]), file).toBe(true);
    expect(first[i].toString("utf8"), file).not.toContain(root);
  }
});

it("REPLAY-012 counts a run step's timings as 00:00:00 and 0ms, the same on both runs", () => {
  // print.mjs prints the first run's timings, or the second run's when REPLAY_012_RUN is 2.
  const root = benchRoot({
    "steps/speckit/feature.yaml": "steps:\n" + step("run\n    command: node print.mjs\n"),
    "fixture/start/print.mjs":
      `const second = process.env.REPLAY_012_RUN === "2";\n` +
      `console.log(second ? "Start at 09:15:40" : "Start at 14:02:11");\n` +
      `console.log(second ? "Duration 12.3s" : "Duration 6.92s");\n`,
  });
  const runContext = (n: string) => {
    process.env.REPLAY_012_RUN = n;
    try {
      const run = replay(root);
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    } finally {
      delete process.env.REPLAY_012_RUN;
    }
    return ownSteps(results(root).workflows.speckit.feature)[0].context;
  };

  const first = runContext("1");
  const second = runContext("2");

  const normalized = Buffer.byteLength("Start at 00:00:00\nDuration 0ms\n");
  expect(first).toBe(normalized);
  expect(second).toBe(normalized);
});

it("REPLAY-013 records the bytes npx --no-install vitest --version prints in the bench root", () => {
  // benchRoot links this package's node_modules into the root, as a real bench has its own.
  // An empty npm cache keeps npx from finding a cached vitest, of another version, outside the
  // bench; without the update notice, the command prints only the version line.
  const command = "npx --no-install vitest --version";
  const root = benchRoot({ "steps/speckit/feature.yaml": "steps:\n" + step(`run\n    command: ${command}\n`) });
  const cache = mkdtempSync(join(tmpdir(), "replay-npm-cache-"));
  const saved = { npm_config_cache: process.env.npm_config_cache, npm_config_update_notifier: process.env.npm_config_update_notifier };
  process.env.npm_config_cache = cache;
  process.env.npm_config_update_notifier = "false";
  let inRoot, run;
  try {
    inRoot = spawnSync(command, { cwd: root, shell: true });
    run = replay(root);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(cache, { recursive: true, force: true });
  }
  expect(inRoot.status).toBe(0);
  // The version line holds no duration or clock time, so normalising leaves its length as printed.
  expect(inRoot.stdout.toString("utf8")).toMatch(/^vitest\/\d+\.\d+\.\d+ /);
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const [vitest] = ownSteps(results(root).workflows.speckit.feature);
  expect(vitest.context).toBe(inRoot.stdout.length + inRoot.stderr.length);
});

it("REPLAY-010 prints the sj gain mismatch for next, replay 900 against sj gain 950, and exits 1", () => {
  // A stand-in for the pinned sj: `sj next` prints 900 bytes, `sj gain --json` reports 950 for next.
  const pin = "0.5.0";
  const sj = join(".bench", "tools", `specjutsu@${pin}`, "bin", "sj");
  const root = benchRoot({
    "pins.json": JSON.stringify({ specjutsu: pin, superpowers: SUPERPOWERS }),
    "steps/specjutsu/feature.yaml": "steps:\n" + step("run\n    command: sj next\n"),
    [sj]:
      "#!/usr/bin/env node\n" +
      // Like the real sj, it reports gain only for a git repo, given by --root or the cwd.
      `const { existsSync } = process.getBuiltinModule("node:fs");\n` +
      `const at = process.argv.indexOf("--root");\n` +
      `const dir = at > 0 ? process.argv[at + 1] : process.cwd();\n` +
      `if (process.argv[2] === "gain" && !existsSync(dir + "/.git")) process.exit(1);\n` +
      `if (process.argv[2] === "next") process.stdout.write("n".repeat(900));\n` +
      `if (process.argv[2] === "gain") console.log(JSON.stringify({ commands: [{ command: "next", printed: 950, raw: 9000, runs: 1, saved_pct: 89 }] }));\n`,
  });
  chmodSync(join(root, sj), 0o755);

  const run = replay(root);

  expect(run.stderr.trim()).toBe("sj gain mismatch for next: replay 900, sj gain 950");
  expect(run.status).toBe(1);
});

describe("sj gain cross-check", () => {
  const pin = "0.5.0";
  const sj = join(".bench", "tools", `specjutsu@${pin}`, "bin", "sj");
  const files = {
    "pins.json": JSON.stringify({ specjutsu: pin, superpowers: SUPERPOWERS }),
    "steps/specjutsu/feature.yaml": "steps:\n" + step("run\n    command: sj next\n"),
  };

  it("refuses an sj step when the pinned sj is not installed, without using the sj on PATH", () => {
    const root = benchRoot(files);

    const run = replay(root);

    expect(run.stderr.trim()).toBe(
      `steps/specjutsu/feature.yaml step 1: specjutsu@${pin} is not installed: .bench/tools/specjutsu@${pin}/bin/sj`,
    );
    expect(run.status).toBe(1);
  });

  it("reports a failed sj gain --json by script and its first stderr line, not as a mismatch", () => {
    const root = benchRoot({
      ...files,
      [sj]:
        "#!/usr/bin/env node\n" +
        `if (process.argv[2] === "next") process.stdout.write("n".repeat(900));\n` +
        `if (process.argv[2] === "gain") { process.stderr.write("ledger locked\\nmore\\n"); process.exit(1); }\n`,
    });
    chmodSync(join(root, sj), 0o755);

    const run = replay(root);

    expect(run.stderr.trim()).toBe("sj gain --json failed for specjutsu/feature: ledger locked");
    expect(run.status).toBe(1);
  });
});

it("REPLAY-014 counts the workspace path a run step prints as /workspace", () => {
  const command = `node -e "console.log(process.cwd() + '/test/terms.test.ts')"`;
  const root = benchRoot({ "steps/speckit/feature.yaml": "steps:\n" + step(`run\n    command: ${command}\n`) });

  const run = replay(root);

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  const [printed] = ownSteps(results(root).workflows.speckit.feature);
  expect(printed.context).toBe(Buffer.byteLength("/workspace/test/terms.test.ts\n"));
});

it("REPLAY-015 commits the start state on main as one fixture start commit with the same hash on every run and machine", () => {
  // Later steps write the log and the committed files to files outside the workspace, so the
  // test can read them.
  const command = "git log --format=%H%n%s main";
  const root = benchRoot({
    "steps/speckit/feature.yaml":
      "steps:\n" +
      step(`run\n    command: ${command}\n`) +
      step(`run\n    command: ${command} > "$REPLAY_015_OUT/log"\n`) +
      step(`run\n    command: git ls-files > "$REPLAY_015_OUT/files"\n`),
    // Neither the ledger nor an installed node_modules belongs in the start commit.
    "fixture/start/.specjutsu/ledger/gain.jsonl": "{}\n",
    "fixture/start/node_modules/left-out/index.js": "\n",
  });
  // A machine whose git setup would change the commit: a default ignore file and a template that
  // leave start files out, default attributes and a clean filter that rewrite blobs, another
  // commit encoding (in the global config and as `git -c` config in the env) and default branch,
  // and a GIT_DIR pointing elsewhere, as inside a git hook.
  const machine = mkdtempSync(join(tmpdir(), "replay-015-machine-"));
  mkdirSync(join(machine, "template", "info"), { recursive: true });
  writeFileSync(join(machine, "template", "info", "exclude"), "file-3.md\n");
  mkdirSync(join(machine, "xdg", "git"), { recursive: true });
  writeFileSync(join(machine, "xdg", "git", "ignore"), "file-2.md\n");
  writeFileSync(join(machine, "xdg", "git", "attributes"), "* text eol=crlf\n*.md filter=upper\n");
  writeFileSync(
    join(machine, "gitconfig"),
    `[core]\n\tautocrlf = true\n` +
      `[init]\n\tdefaultBranch = trunk\n\ttemplateDir = ${join(machine, "template")}\n` +
      `[i18n]\n\tcommitEncoding = latin1\n` +
      `[filter "upper"]\n\tclean = tr a-z A-Z\n`,
  );
  const hostile = {
    GIT_CONFIG_GLOBAL: join(machine, "gitconfig"),
    XDG_CONFIG_HOME: join(machine, "xdg"),
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "i18n.commitEncoding",
    GIT_CONFIG_VALUE_0: "latin1",
    GIT_DIR: join(machine, "elsewhere.git"),
  };
  const runOnce = (n: number) => {
    const out = join(machine, `run-${n}`);
    mkdirSync(out);
    const saved = Object.fromEntries(Object.keys(hostile).map((key) => [key, process.env[key]]));
    Object.assign(process.env, hostile, { REPLAY_015_OUT: out });
    try {
      const run = replay(root);
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    } finally {
      delete process.env.REPLAY_015_OUT;
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    return {
      log: readFileSync(join(out, "log"), "utf8"),
      files: readFileSync(join(out, "files"), "utf8"),
      context: ownSteps(results(root).workflows.speckit.feature)[0].context,
    };
  };
  // The expected hash: the same start files committed in a repo of the test's own, with no
  // global or system config and design.md's fixed author, committer and date.
  const expectedHash = (repo: string) => {
    for (let i = 1; i <= 3; i++) writeFileSync(join(repo, `file-${i}.md`), `file ${i}\n`);
    const date = "2026-01-01T00:00:00Z";
    const env = {
      PATH: process.env.PATH ?? "",
      HOME: repo,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_ATTR_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "bench",
      GIT_AUTHOR_EMAIL: "bench@localhost",
      GIT_COMMITTER_NAME: "bench",
      GIT_COMMITTER_EMAIL: "bench@localhost",
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    };
    const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, env, encoding: "utf8" }).stdout.trim();
    git("init", "-q", "--template=", "--object-format=sha1");
    git("add", "-A");
    return git("commit-tree", git("write-tree"), "-m", "fixture start");
  };

  const repo = mkdtempSync(join(tmpdir(), "replay-015-repo-"));
  try {
    const first = runOnce(1);
    const second = runOnce(2);
    const hash = expectedHash(repo);

    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    // One commit: its hash line and its subject, of only the start files.
    expect(first.log).toBe(`${hash}\nfixture start\n`);
    expect(first.context).toBe(Buffer.byteLength(first.log));
    expect(first.files).toBe("file-1.md\nfile-2.md\nfile-3.md\n");
    expect(second.log).toBe(first.log);
  } finally {
    for (const dir of [root, machine, repo]) rmSync(dir, { recursive: true, force: true });
  }
});

it("REPLAY-016 records the same git diff context bytes with a global diff.noprefix config as with none", () => {
  const root = benchRoot({
    "steps/speckit/feature.yaml":
      "steps:\n" +
      step(`run\n    command: node -e "require('fs').appendFileSync('file-1.md', 'changed\\\\n')"\n`) +
      step("run\n    command: git diff\n"),
  });
  const machine = mkdtempSync(join(tmpdir(), "replay-016-machine-"));
  writeFileSync(join(machine, "gitconfig"), `[diff]\n\tnoprefix = true\n[color]\n\tui = always\n`);
  const diffContext = (globalConfig: string) => {
    const saved = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    try {
      const run = replay(root);
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = saved;
    }
    return ownSteps(results(root).workflows.speckit.feature)[1].context;
  };

  try {
    const hostile = diffContext(join(machine, "gitconfig"));
    const none = diffContext("/dev/null");

    expect(none).toBeGreaterThan(0);
    expect(hostile).toBe(none);
  } finally {
    for (const dir of [root, machine]) rmSync(dir, { recursive: true, force: true });
  }
});
