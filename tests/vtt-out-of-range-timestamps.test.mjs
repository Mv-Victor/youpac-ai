import assert from "node:assert/strict";
import test from "node:test";

import { parseVTT } from "../app/utils/transcription-upload.ts";

test("WebVTT rejects out-of-range minutes and seconds but accepts 59", () => {
  for (const [start, end] of [
    ["00:99.000", "02:00.000"],
    ["00:99:00.000", "02:00:00.000"],
  ]) {
    const parsed = parseVTT(`WEBVTT\n\n${start} --> ${end}\nBad cue\n`);
    assert.deepEqual(parsed.segments, [], `${start} must be rejected`);
  }

  const parsed = parseVTT(
    "WEBVTT\n\n59:59.000 --> 01:00:00.000\nHourless boundary\n\n00:59:59.000 --> 01:00:00.000\nHour-prefixed boundary\n",
  );

  assert.deepEqual(parsed.segments, [
    { start: 3599, end: 3600, text: "Hourless boundary" },
    { start: 3599, end: 3600, text: "Hour-prefixed boundary" },
  ]);
});
