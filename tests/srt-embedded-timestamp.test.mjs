import assert from "node:assert/strict";
import test from "node:test";
import { parseSRT } from "../app/utils/transcription-upload.ts";

test("SRT parser rejects timestamp ranges embedded in ordinary text", () => {
  const embedded = parseSRT("comment 0:00:01,000 --> 0:00:02,000\nHello");
  const valid = parseSRT("0:00:01,000 --> 0:00:02,000\nHello");

  assert.deepEqual(embedded.segments, []);
  assert.deepEqual(valid.segments, [{ start: 1, end: 2, text: "Hello" }]);
});
