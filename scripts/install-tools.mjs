// Installs every pinned tool into .bench/tools/<tool>@<pin>/ (see design.md, "Tools install into").
// Each install is the tool's repository at tag v<pin>, or at the commit a 40-hex pin names; specjutsu
// takes a version pin and also gets its release binary in bin/sj, checked against the release's
// SHA256SUMS. An install that already exists is left as it is. Installs are staged under .bench/ so
// the final rename stays on one filesystem.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPOS = {
  specjutsu: "nabour-labs/specjutsu",
  speckit: "github/spec-kit",
  openspec: "Fission-AI/OpenSpec",
  superpowers: "obra/superpowers",
};

const SJ_ASSETS = {
  "darwin-arm64": "sj-aarch64-apple-darwin.tar.gz",
  "darwin-x64": "sj-x86_64-apple-darwin.tar.gz",
  "linux-arm64": "sj-aarch64-unknown-linux-gnu.tar.gz",
  "linux-x64": "sj-x86_64-unknown-linux-gnu.tar.gz",
};

const root = process.cwd();
const pins = JSON.parse(readFileSync(join(root, "pins.json"), "utf8"));

for (const [tool, pin] of Object.entries(pins)) {
  const repo = REPOS[tool];
  if (!repo) throw new Error(`no repository known for pinned tool ${tool}`);
  const dir = join(root, ".bench", "tools", `${tool}@${pin}`);
  if (existsSync(dir)) {
    console.log(`${tool}@${pin}: already installed`);
    continue;
  }
  const commit = /^[0-9a-f]{40}$/.test(pin);
  if (commit && tool === "specjutsu") {
    console.error(`specjutsu@${pin}: sj comes from a release, so specjutsu needs a version pin, not a commit`);
    process.exit(1);
  }
  mkdirSync(join(root, ".bench"), { recursive: true });
  const staging = mkdtempSync(join(root, ".bench", `tmp-${tool}-`));
  try {
    const checkout = join(staging, "repo");
    const url = `https://github.com/${repo}.git`;
    if (commit) {
      mkdirSync(checkout);
      git("-C", checkout, "init", "--quiet");
      git("-C", checkout, "remote", "add", "origin", url);
      git("-C", checkout, "fetch", "--quiet", "--depth", "1", "origin", pin);
      git("-C", checkout, "checkout", "--quiet", "FETCH_HEAD");
    } else {
      git("clone", "--quiet", "--depth", "1", "--branch", `v${pin}`, url, checkout);
    }
    rmSync(join(checkout, ".git"), { recursive: true, force: true });
    if (tool === "specjutsu") installSj(pin, checkout, staging);
    mkdirSync(join(root, ".bench", "tools"), { recursive: true });
    renameSync(checkout, dir);
    console.log(`${tool}@${pin}: installed`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function git(...args) {
  execFileSync("git", ["-c", "advice.detachedHead=false", ...args], { stdio: ["ignore", "ignore", "inherit"] });
}

function installSj(pin, checkout, staging) {
  const asset = SJ_ASSETS[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error(`no sj release binary for ${process.platform}-${process.arch}`);
  const base = `https://github.com/nabour-labs/specjutsu/releases/download/v${pin}`;
  const archive = join(staging, asset);
  writeFileSync(archive, fetchBytes(`${base}/${asset}`));
  const sums = fetchBytes(`${base}/SHA256SUMS`).toString("utf8");
  const expected = sums.split("\n").map((line) => line.trim().split(/\s+/)).find(([, name]) => name === asset)?.[0];
  const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (!expected) throw new Error(`${asset} is not listed in SHA256SUMS`);
  if (expected !== actual) throw new Error(`${asset}: sha256 ${actual} does not match SHA256SUMS ${expected}`);
  const unpacked = join(staging, "unpacked");
  mkdirSync(unpacked);
  execFileSync("tar", ["-xzf", archive, "-C", unpacked]);
  const binary = execFileSync("find", [unpacked, "-type", "f", "-name", "sj"], { encoding: "utf8" }).trim().split("\n")[0];
  if (!binary) throw new Error(`${asset} holds no sj binary`);
  mkdirSync(join(checkout, "bin"), { recursive: true });
  renameSync(binary, join(checkout, "bin", "sj"));
  execFileSync("chmod", ["+x", join(checkout, "bin", "sj")]);
}

function fetchBytes(url) {
  return execFileSync("curl", ["--fail", "--silent", "--show-error", "--location", url], { maxBuffer: 64 * 1024 * 1024 });
}
