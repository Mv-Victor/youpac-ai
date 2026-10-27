import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("title-cased transcription timeout receives timeout guidance", () => {
  const result = getErrorDetails(new Error("Transcription Timeout"));

  assert.equal(result.type, "transcription");
  assert.equal(
    result.details,
    "The transcription took too long. Try with a shorter video.",
  );
});
