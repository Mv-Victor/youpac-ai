import test from "node:test";
import assert from "node:assert/strict";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("parseJSON requires a non-empty string for a top-level transcript", () => {
  for (const transcript of [null, 123, true, {}, [], "", "   "]) {
    assert.throws(
      () => parseJSON(JSON.stringify({ transcript })),
      /Invalid JSON format/,
      `expected ${JSON.stringify(transcript)} to be rejected`,
    );
  }

  const parsed = parseJSON(JSON.stringify({ transcript: "Valid transcript" }));
  assert.equal(parsed.segments[0].text, "Valid transcript");
  assert.equal(typeof parsed.segments[0].text, "string");
});
