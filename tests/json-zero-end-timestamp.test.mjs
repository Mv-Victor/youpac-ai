import assert from "node:assert/strict";
import test from "node:test";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("JSON segments preserve zero end timestamps and default absent ends", () => {
  const parsed = parseJSON(JSON.stringify([
    { start: 0, end: 0, text: "explicit end" },
    { start: 10, endTime: 0, text: "explicit endTime" },
    { start: 20, text: "default end" },
  ]));

  assert.deepEqual(parsed.segments, [
    { start: 0, end: 0, text: "explicit end" },
    { start: 10, end: 0, text: "explicit endTime" },
    { start: 20, end: 25, text: "default end" },
  ]);
});
