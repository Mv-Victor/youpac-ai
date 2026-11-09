import assert from "node:assert/strict";
import test from "node:test";
import { parseSRT } from "../app/utils/transcription-upload.ts";

test("SRT parser accepts one-digit hour timestamps", () => {
  const parsed = parseSRT("0:00:01,000 --> 0:00:02,000\nHello");

  assert.deepEqual(parsed.segments, [{ start: 1, end: 2, text: "Hello" }]);
  assert.equal(parsed.fullText, "Hello");
});
