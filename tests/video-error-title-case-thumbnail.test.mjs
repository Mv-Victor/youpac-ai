import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("classifies a title-cased thumbnail generation error", () => {
  assert.deepEqual(getErrorDetails(new Error("Thumbnail generation failed")), {
    type: "thumbnail",
    message: "Failed to generate thumbnail",
    details: "We couldn't generate a thumbnail automatically.",
    recoverable: true,
  });
});
