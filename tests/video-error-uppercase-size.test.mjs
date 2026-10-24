import assert from "node:assert/strict";
import test from "node:test";

import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("classifies uppercase file-size errors", () => {
  const result = getErrorDetails(new Error("Video file is TOO LARGE"));

  assert.equal(result.type, "size");
  assert.equal(result.message, "Video file is too large");
  assert.equal(result.recoverable, false);
});
