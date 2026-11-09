import assert from "node:assert/strict";
import test from "node:test";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("JSON parser coerces numeric timestamp strings and rejects malformed timestamps", () => {
  const parsed = parseJSON('[{"start":"12.5","end":"18.25","text":"Hello"}]');

  assert.deepEqual(parsed.segments, [
    { start: 12.5, end: 18.25, text: "Hello" },
  ]);
  assert.throws(
    () => parseJSON('[{"start":"soon","end":18,"text":"Invalid"}]'),
    { message: "Invalid JSON format" },
  );
});
