import test from "node:test";
import assert from "node:assert/strict";
import { parseSRT } from "../app/utils/transcription-upload.ts";

test("parseSRT removes carriage returns from multiline CRLF cue text", () => {
  const parsed = parseSRT(
    "1\r\n00:00:00,000 --> 00:00:02,000\r\nHello\r\nworld\r\n",
  );

  assert.equal(parsed.segments[0].text, "Hello world");
  assert.equal(parsed.fullText, "Hello world");
  assert.equal(parsed.fullText.includes("\r"), false);
});
