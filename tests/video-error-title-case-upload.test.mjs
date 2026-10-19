import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("classifies a title-cased interrupted upload as an upload error", () => {
  assert.deepEqual(getErrorDetails(new Error("Upload interrupted")), {
    type: "upload",
    message: "Failed to upload video",
    details: "The video upload was interrupted. Please try again.",
    recoverable: true,
  });
});
