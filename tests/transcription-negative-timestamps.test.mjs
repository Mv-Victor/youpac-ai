import assert from "node:assert/strict";
import test from "node:test";
import { parseJSON, validateTranscription } from "../app/utils/transcription-upload.ts";

test("timestamp validation rejects negative JSON segment timestamps", () => {
  for (const content of [
    '[{"start":-5,"end":1,"text":"negative start"}]',
    '[{"start":0,"end":-1,"text":"negative end"}]',
  ]) {
    const result = validateTranscription(parseJSON(content));

    assert.equal(result.isValid, false);
    assert.equal(result.errors.includes("Some subtitles have a negative timestamp"), true);
  }
});
