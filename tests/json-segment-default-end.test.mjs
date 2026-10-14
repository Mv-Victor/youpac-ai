import assert from "node:assert/strict";
import test from "node:test";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("JSON segments default end to five seconds after startTime", () => {
  const parsed = parseJSON(JSON.stringify([
    { startTime: 12, text: "Hello" },
  ]));

  assert.deepEqual(parsed.segments, [
    { start: 12, end: 17, text: "Hello" },
  ]);
});
