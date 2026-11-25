import assert from "node:assert/strict";
import test from "node:test";
import { parseVTT } from "../app/utils/transcription-upload.ts";

test("VTT accepts one-digit hour components", () => {
  const parsed = parseVTT("WEBVTT\n\n1:02:03.000 --> 1:02:05.000\nOne-digit hour cue\n");

  assert.deepEqual(parsed.segments, [
    { start: 3723, end: 3725, text: "One-digit hour cue" },
  ]);
});
