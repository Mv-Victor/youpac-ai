import assert from "node:assert/strict";
import test from "node:test";
import { parseJSON, validateTranscription } from "../app/utils/transcription-upload.ts";

const overlapWarning = "Some subtitles have overlapping timestamps";

test("out-of-order non-overlapping JSON segments do not produce an overlap warning", () => {
  const transcription = parseJSON(JSON.stringify([
    { start: 20, end: 30, text: "later" },
    { start: 0, end: 10, text: "earlier" },
  ]));

  assert.equal(validateTranscription(transcription).warnings.includes(overlapWarning), false);
});

test("out-of-order intersecting segments produce exactly one overlap warning", () => {
  const transcription = parseJSON(JSON.stringify([
    { start: 20, end: 30, text: "later" },
    { start: 25, end: 35, text: "overlapping" },
    { start: 0, end: 10, text: "earlier" },
  ]));

  const warnings = validateTranscription(transcription).warnings;
  assert.equal(warnings.filter((warning) => warning === overlapWarning).length, 1);
});
