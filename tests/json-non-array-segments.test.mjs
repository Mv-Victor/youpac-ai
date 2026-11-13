import assert from "node:assert/strict";
import test from "node:test";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("parseJSON rejects non-array segments values", () => {
  for (const segments of [{}, null, "not an array", 42]) {
    assert.throws(
      () => parseJSON(JSON.stringify({ segments })),
      error => error instanceof Error && error.message === "Invalid JSON format",
      `expected non-array segments value to be rejected: ${JSON.stringify(segments)}`
    );
  }
});
