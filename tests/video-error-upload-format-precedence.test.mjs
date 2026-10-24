import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("unsupported codecs take precedence over generic upload failures", () => {
  const result = getErrorDetails(new Error("Upload failed: codec not supported"));

  assert.equal(result.type, "format");
  assert.equal(result.message, "Unsupported video format");
  assert.equal(result.recoverable, false);
});
