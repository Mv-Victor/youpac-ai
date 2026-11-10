import assert from "node:assert/strict";
import test from "node:test";
import { parseTXT } from "../app/utils/transcription-upload.ts";

test("TXT parser only recognizes timestamps at the start of a line", () => {
  assert.deepEqual(parseTXT("Meeting starts [00:01:00] now"), {
    segments: [
      { start: 0, end: 5, text: "Meeting starts [00:01:00] now" },
    ],
    fullText: "Meeting starts [00:01:00] now",
    format: "txt",
  });

  for (const timestamp of ["[00:01:00]", "(00:01:00)"]) {
    assert.deepEqual(parseTXT(`${timestamp} now`), {
      segments: [{ start: 60, end: 65, text: "now" }],
      fullText: "now",
      format: "txt",
    });
  }
});
