import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const suites = [
  [
    "homepage",
    new URL("./home-loader.test.mjs", import.meta.url),
    [
      /ok \d+ - signed out, spaces-only configuration skips Convex entirely/,
      /ok \d+ - signed out, tabs-only configuration skips Convex entirely/,
      /ok \d+ - signed in, spaces-only configuration skips Convex entirely/,
      /ok \d+ - signed in, tabs-only configuration skips Convex entirely/,
      /ok \d+ - signed out, padded explicit configuration returns queried stats/,
      /ok \d+ - signed in, padded explicit configuration returns queried stats/,
    ],
  ],
  [
    "share loader",
    new URL("./share-loader.test.mjs", import.meta.url),
    [
      /ok \d+ - share loader fails before creating a Convex client with spaces-only configuration/,
      /ok \d+ - share loader fails before creating a Convex client with tabs-only configuration/,
      /ok \d+ - share loader queries the configured Convex deployment/,
    ],
  ],
];
const { NODE_TEST_CONTEXT: _testContext, ...standaloneEnvironment } = process.env;

for (const [name, suiteUrl, expectedPassingCases] of suites) {
  test(`${name} suite executes whitespace-only and padded Convex cases`, () => {
    const result = spawnSync(process.execPath, ["--test", fileURLToPath(suiteUrl)], {
      encoding: "utf8",
      env: standaloneEnvironment,
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`;

    assert.equal(result.status, 0, output);
    for (const passingCase of expectedPassingCases) assert.match(output, passingCase);
  });
}
