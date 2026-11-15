import assert from "node:assert/strict";
import test from "node:test";
import { validateTranscription } from "../app/utils/transcription-upload.ts";

const transcription = {
  segments: [{ start: 0, end: 6, text: "x" }],
  fullText: "x",
  format: "txt",
};

test("timestamp validation includes zero-duration videos but skips omitted duration", () => {
  assert.deepEqual(validateTranscription(transcription, 0).warnings, [
    "Timestamps exceed video duration (0:00)",
  ]);
  assert.deepEqual(validateTranscription(transcription).warnings, []);
});
