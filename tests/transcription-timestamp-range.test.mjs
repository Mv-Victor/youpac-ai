import assert from "node:assert/strict";
import test from "node:test";
import { validateTranscription } from "../app/utils/transcription-upload.ts";

test("timestamp validation warns when an earlier segment exceeds the video duration", () => {
  const transcription = {
    segments: [
      { start: 0, end: 100, text: "early" },
      { start: 1, end: 1, text: "last" },
    ],
    fullText: "early last",
    format: "txt",
  };

  assert.equal(
    validateTranscription(transcription, 10).warnings.includes(
      "Timestamps exceed video duration (0:10)"
    ),
    true
  );
});
