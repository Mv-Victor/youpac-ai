import test from "node:test";
import assert from "node:assert/strict";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("parseJSON rejects non-string segment text values", () => {
  assert.throws(
    () => parseJSON('[{"text":123}]'),
    /Invalid JSON format/,
  );

  assert.throws(
    () => parseJSON(JSON.stringify({ segments: [{ content: false }] })),
    /Invalid JSON format/,
  );
});
