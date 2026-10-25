import assert from "node:assert/strict";
import test from "node:test";

import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("title-cased Whisper failures are classified as recoverable transcription errors", () => {
  const result = getErrorDetails(new Error("Whisper request failed"));

  assert.equal(result.type, "transcription");
  assert.equal(result.message, "Failed to transcribe video");
  assert.equal(result.recoverable, true);
});
