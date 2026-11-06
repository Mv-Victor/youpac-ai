import assert from "node:assert/strict";
import test from "node:test";
import { parseSRT } from "../app/utils/transcription-upload.ts";

test("SRT parser locates timestamps after non-numeric identifiers and metadata", () => {
  const parsed = parseSRT("intro\nNOTE metadata\n00:00:01,000 --> 00:00:02,000\nHello");

  assert.deepEqual(parsed.segments, [{ start: 1, end: 2, text: "Hello" }]);
});
