import test from "node:test";
import assert from "node:assert/strict";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("parseJSON rejects unsupported top-level JSON objects", () => {
  assert.throws(() => parseJSON("{}"), new Error("Invalid JSON format"));
});
