import assert from "node:assert/strict";
import test from "node:test";
import { parseVTT } from "../app/utils/transcription-upload.ts";

test("VTT cue text preserves arrow sequences", () => {
  const parsed = parseVTT(
    "WEBVTT\n\n00:00.000 --> 00:02.000\nUse a --> b\n00:02.000 --> 00:04.000\nNext cue\n",
  );

  assert.deepEqual(parsed.segments, [
    { start: 0, end: 2, text: "Use a --> b" },
    { start: 2, end: 4, text: "Next cue" },
  ]);
});
