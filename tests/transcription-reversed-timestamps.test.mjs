import assert from "node:assert/strict";
import test from "node:test";
import { validateTranscription } from "../app/utils/transcription-upload.ts";

test("timestamp validation rejects segments whose end precedes their start", () => {
  const result = validateTranscription({
    segments: [{ start: 10, end: 5, text: "x" }],
    fullText: "x",
    format: "txt",
  });

  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.includes("Some subtitles have an end timestamp before their start timestamp"),
    true
  );
});
