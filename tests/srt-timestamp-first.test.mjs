import assert from "node:assert/strict";
import test from "node:test";
import { parseSRT } from "../app/utils/transcription-upload.ts";

test("SRT parser accepts timestamp-first cues without sequence numbers", () => {
  const parsed = parseSRT("00:00:01,000 --> 00:00:02,000\nHello");

  assert.deepEqual(parsed.segments, [{ start: 1, end: 2, text: "Hello" }]);
  assert.equal(parsed.fullText, "Hello");
});
