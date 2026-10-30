import assert from "node:assert/strict";
import test from "node:test";

import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("parses file sizes with whitespace before MB and applies the size limit", () => {
  const unsupported = getErrorDetails(new Error("Video too large: 150 MB"));
  const recoverable = getErrorDetails(new Error("Video too large: 25 mb"));

  assert.match(unsupported.details, /Your video is 150MB\./);
  assert.equal(unsupported.recoverable, false);
  assert.match(recoverable.details, /Your video is 25MB\./);
  assert.equal(recoverable.recoverable, true);
});
