import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const suites = [
  ["homepage", new URL("./home-loader.test.mjs", import.meta.url)],
  ["share loader", new URL("./share-loader.test.mjs", import.meta.url)],
];

for (const [name, suiteUrl] of suites) {
  test(`${name} suite covers whitespace-only and padded Convex configuration`, () => {
    const source = readFileSync(suiteUrl, "utf8");

    assert.match(source, /spaces-only/);
    assert.match(source, /tabs-only/);
    assert.match(source, /VITE_CONVEX_URL: " [^"\n]+ "/);
  });
}
