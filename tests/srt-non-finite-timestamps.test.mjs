import assert from "node:assert/strict";
import test from "node:test";
import { parseSRT, validateTranscription } from "../app/utils/transcription-upload.ts";

test("validation rejects SRT timestamps that overflow to infinity", () => {
  const hours = "9".repeat(400);
  const parsed = parseSRT(
    `1\n${hours}:00:00,000 --> ${hours}:00:01,000\nOverflowing cue`,
  );

  assert.equal(parsed.segments.length, 1);
  assert.equal(Number.isFinite(parsed.segments[0].start), false);
  assert.equal(Number.isFinite(parsed.segments[0].end), false);

  const result = validateTranscription(parsed);
  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.includes("Some subtitles have a non-finite timestamp"),
    true,
  );
});
