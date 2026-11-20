import assert from "node:assert/strict";
import test from "node:test";
import { parseSRT, validateTranscription } from "../app/utils/transcription-upload.ts";

test("SRT parser rejects minute and second fields above 59", () => {
  const malformed = parseSRT(
    "1\n00:99:98,000 --> 00:99:99,000\nBad",
  );

  assert.equal(malformed.segments.length, 0);
  assert.equal(validateTranscription(malformed).isValid, false);

  const valid = parseSRT(
    "1\n00:59:58,000 --> 00:59:59,000\nGood",
  );
  assert.deepEqual(valid.segments, [
    { start: 3598, end: 3599, text: "Good" },
  ]);
  assert.equal(validateTranscription(valid).isValid, true);
});
