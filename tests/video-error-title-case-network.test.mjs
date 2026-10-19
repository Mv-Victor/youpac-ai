import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("title-cased network failures are classified as recoverable network errors", () => {
  const result = getErrorDetails(new Error("Network request failed"));

  assert.equal(result.type, "network");
  assert.equal(result.message, "Network connection error");
  assert.equal(result.recoverable, true);
});
