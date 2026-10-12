import assert from "node:assert/strict";
import test from "node:test";
import { parseVTT, parseTranscriptionFile, validateTranscription } from "../app/utils/transcription-upload.ts";

test("VTT cues without an hour component retain milliseconds and text", () => {
  const parsed = parseVTT("WEBVTT\n\n00:01.250 --> 00:04.750\nHello\nworld\n\n01:02.500 --> 01:05.000\nNext cue\n");

  assert.deepEqual(parsed, {
    segments: [
      { start: 1.25, end: 4.75, text: "Hello world" },
      { start: 62.5, end: 65, text: "Next cue" },
    ],
    fullText: "Hello world Next cue",
    format: "vtt",
  });
  assert.equal(validateTranscription(parsed).isValid, true);
});

test("VTT timestamps may mix hourless and hour-prefixed endpoints", () => {
  const parsed = parseVTT("WEBVTT\n\n59:59.500 --> 01:00:01.250\nCrossing an hour\n");

  assert.deepEqual(parsed.segments, [
    { start: 3599.5, end: 3601.25, text: "Crossing an hour" },
  ]);
});

test("hour-prefixed VTT cues preserve identifiers, settings and CRLF support", () => {
  const parsed = parseVTT("WEBVTT\r\n\r\nintro\r\n01:02:03.125 --> 01:02:05.875 align:start position:10%\r\nFirst line\r\nSecond line\r\n");

  assert.deepEqual(parsed.segments, [
    { start: 3723.125, end: 3725.875, text: "First line Second line" },
  ]);
});

test("VTT hours longer than two digits are not truncated", () => {
  const parsed = parseVTT("WEBVTT\n\n100:00:01.000 --> 100:00:02.000\nLong recording\n");

  assert.deepEqual(parsed.segments, [
    { start: 360001, end: 360002, text: "Long recording" },
  ]);
});

for (const filename of ["captions.vtt", "captions.webvtt", "captions.unknown"]) {
  test(`file upload accepts hourless VTT timestamps in ${filename}`, async () => {
    const file = new File(["WEBVTT\n\n00:00.000 --> 00:02.500\nUploaded subtitle\n"], filename);
    const parsed = await parseTranscriptionFile(file);

    assert.deepEqual(parsed.segments, [
      { start: 0, end: 2.5, text: "Uploaded subtitle" },
    ]);
    assert.equal(parsed.format, "vtt");
    assert.equal(validateTranscription(parsed).isValid, true);
  });
}
