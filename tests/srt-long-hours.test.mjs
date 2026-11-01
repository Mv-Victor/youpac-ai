import assert from "node:assert/strict";
import test from "node:test";
import { parseSRT } from "../app/utils/transcription-upload.ts";

test("SRT cues preserve timestamps and text when hours exceed two digits", () => {
  const parsed = parseSRT(
    "1\n100:00:00,000 --> 100:00:05,250\nLong recording cue\n\n2\n01:02:03,500 --> 01:02:04,000\nRegular cue\n",
  );

  assert.deepEqual(parsed, {
    segments: [
      { start: 360000, end: 360005.25, text: "Long recording cue" },
      { start: 3723.5, end: 3724, text: "Regular cue" },
    ],
    fullText: "Long recording cue Regular cue",
    format: "srt",
  });
});
