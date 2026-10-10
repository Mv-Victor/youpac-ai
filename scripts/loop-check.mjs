import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, copyFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const baseRef = process.env.LOOP_BASE_SHA;
assert.match(baseRef || "", /^[a-f0-9]{40}$/, "LOOP_BASE_SHA must name a real comparison commit");
const temporary = mkdtempSync(join(tmpdir(), "youpac-check-"));
const base = join(temporary, "baseline");

function run(command, args, cwd, { allowFailure = false, quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 180_000 });
  if (!quiet || result.status !== 0) process.stdout.write((result.stdout || "") + (result.stderr || ""));
  if (result.error) throw result.error;
  if (!allowFailure) assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
  return result;
}

function diagnostics(cwd) {
  const result = run("npm", ["run", "typecheck"], cwd, { allowFailure: true, quiet: true });
  const output = (result.stdout || "") + (result.stderr || "");
  const counts = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.+)$/);
    if (match) {
      const key = `${match[1]}: ${match[2]}: ${match[3]}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (result.status !== 0 && !counts.size) throw new Error(`Typecheck failed without compiler diagnostics:\n${output}`);
  return counts;
}

try {
  run("git", ["worktree", "add", "--detach", base, baseRef], root, { quiet: true });
  if (!existsSync(join(base, "package-lock.json"))) copyFileSync(join(root, "package-lock.json"), join(base, "package-lock.json"));
  run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], base, { quiet: true });
  const oldErrors = diagnostics(base);
  const newErrors = diagnostics(root);
  const regressions = [...newErrors].filter(([error, count]) => count > (oldErrors.get(error) || 0));
  assert.deepEqual(regressions, [], "Candidate introduces new TypeScript errors");
  console.log(JSON.stringify({ typecheck: "no_regression", baselineErrors: [...oldErrors.values()].reduce((a, b) => a + b, 0), candidateErrors: [...newErrors.values()].reduce((a, b) => a + b, 0) }));
  const tests = readdirSync(join(root, "tests")).filter(name => name.endsWith(".test.mjs")).sort().map(name => join("tests", name));
  assert.ok(tests.length, "At least one regression test suite is required");
  run("node", ["--experimental-strip-types", "--test", ...tests], root);
  const baseTests = new Set(run("git", ["ls-tree", "-r", "--name-only", baseRef, "tests"], root, { quiet: true }).stdout.trim().split("\n"));
  const newTests = tests.filter(path => !baseTests.has(path));
  if (newTests.length) {
    for (const path of newTests) copyFileSync(join(root, path), join(base, path));
    const reproduction = run("node", ["--experimental-strip-types", "--test", ...newTests], base, { allowFailure: true });
    const output = (reproduction.stdout || "") + (reproduction.stderr || "");
    assert.notEqual(reproduction.status, 0, "New regression tests must fail on the actual baseline");
    assert.match(output, /ERR_ASSERTION/, "Baseline failure must reproduce an assertion, not missing candidate-only code");
    assert.doesNotMatch(output, /ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|SyntaxError/, "Baseline reproduction cannot fail on test setup");
    console.log(JSON.stringify({ baselineReproduction: "assertion_failure", suites: newTests }));
  }
  run("npm", ["run", "build"], root);
} finally {
  run("git", ["worktree", "remove", "--force", base], root, { allowFailure: true, quiet: true });
  rmSync(temporary, { recursive: true, force: true });
}
