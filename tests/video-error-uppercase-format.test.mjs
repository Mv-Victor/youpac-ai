import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("classifies uppercase format errors as unsupported video formats", () => {
  assert.deepEqual(getErrorDetails(new Error("Unsupported FORMAT")), {
    type: "format",
    message: "Unsupported video format",
    details: "Please upload a video in MP4, MOV, AVI, or WebM format.",
    recoverable: false,
  });
});
