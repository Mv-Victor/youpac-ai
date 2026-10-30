import assert from "node:assert/strict";
import test from "node:test";

import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("file-size conditions take precedence over generic upload failures", () => {
  const result = getErrorDetails(new Error("Upload failed: video too large: 150MB"));

  assert.equal(result.type, "size");
  assert.match(result.details, /Your video is 150MB\./);
  assert.match(result.details, /Files over 100MB are not supported\./);
  assert.equal(result.recoverable, false);
});
