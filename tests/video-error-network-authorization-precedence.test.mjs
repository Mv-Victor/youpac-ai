import assert from "node:assert/strict";
import test from "node:test";

import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("network authorization errors require sign-in instead of retry", () => {
  const result = getErrorDetails(new Error("Network request unauthorized"));

  assert.deepEqual(result, {
    type: "upload",
    message: "Authentication required",
    details: "Please sign in to upload videos.",
    recoverable: false,
  });
});
