import assert from "node:assert/strict";
import test from "node:test";

import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("parses file sizes regardless of unit letter case", () => {
  const recoverable = getErrorDetails(new Error("video too large: 25mb"));
  const unsupported = getErrorDetails(new Error("video too large: 150MB"));

  assert.match(recoverable.details, /Your video is 25MB\./);
  assert.equal(recoverable.recoverable, true);
  assert.match(unsupported.details, /Your video is 150MB\./);
  assert.equal(unsupported.recoverable, false);
});
