import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("classifies title-cased metadata errors", () => {
  assert.deepEqual(getErrorDetails(new Error("Metadata parsing failed")), {
    type: "metadata",
    message: "Failed to extract video information",
    details:
      "Some video details couldn't be extracted, but your video was uploaded successfully.",
    recoverable: true,
  });
});
