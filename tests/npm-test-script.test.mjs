import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("npm test runs every project test file", async () => {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));

  assert.equal(
    packageJson.scripts?.test,
    "node --experimental-strip-types --test tests/*.test.mjs",
    "package.json must expose the complete Node test suite through npm test",
  );
});
