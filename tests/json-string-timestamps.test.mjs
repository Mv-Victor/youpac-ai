import assert from "node:assert/strict";
import test from "node:test";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("JSON segments normalize string timestamps and numeric default end", () => {
  const parsed = parseJSON('[{"start":"12","text":"Hello"}]');

  assert.deepEqual(parsed.segments, [
    { start: 12, end: 17, text: "Hello" },
  ]);
  assert.equal(typeof parsed.segments[0].start, "number");
  assert.equal(typeof parsed.segments[0].end, "number");
});
