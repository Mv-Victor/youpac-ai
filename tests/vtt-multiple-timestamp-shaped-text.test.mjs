import assert from "node:assert/strict";
import test from "node:test";
import { parseVTT } from "../app/utils/transcription-upload.ts";

test("VTT preserves consecutive timestamp-shaped cue text lines", () => {
  const parsed = parseVTT(
    "WEBVTT\n\n00:00.000 --> 00:05.000\n00:01.000 --> 00:02.000\n00:03.000 --> 00:04.000\nAfter\n",
  );

  assert.deepEqual(parsed.segments, [
    {
      start: 0,
      end: 5,
      text: "00:01.000 --> 00:02.000 00:03.000 --> 00:04.000 After",
    },
  ]);
});
