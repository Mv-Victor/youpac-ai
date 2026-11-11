import test from "node:test";
import assert from "node:assert/strict";
import { parseJSON } from "../app/utils/transcription-upload.ts";

test("parseJSON rejects empty and non-numeric timestamp values", () => {
  for (const content of [
    '[{"start":"","end":"","text":"x"}]',
    '[{"start":"   ","end":true,"text":"x"}]',
  ]) {
    assert.throws(() => parseJSON(content), /Invalid JSON format/);
  }
});
