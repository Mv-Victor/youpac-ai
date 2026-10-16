import assert from "node:assert/strict";
import test from "node:test";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("JSON segments preserve an explicit zero start over startTime", () => {
  const parsed = parseJSON('[{"start":0,"startTime":12,"text":"Hello"}]');

  assert.deepEqual(parsed.segments, [
    { start: 0, end: 5, text: "Hello" },
  ]);
});
