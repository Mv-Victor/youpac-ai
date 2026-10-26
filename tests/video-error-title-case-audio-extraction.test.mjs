import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("classifies title-cased audio extraction failures", () => {
  assert.deepEqual(getErrorDetails(new Error("Audio Extraction Failed")), {
    type: "extraction",
    message: "Failed to extract audio",
    details:
      "We couldn't extract audio from your video for transcription. The video might be corrupted or use an unsupported codec.",
    recoverable: false,
  });
});
