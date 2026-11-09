import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("frame extraction does not run an output-less FFmpeg probe", async () => {
  const source = await readFile(new URL("../app/lib/video-frames.ts", import.meta.url), "utf8");

  assert.doesNotMatch(
    source,
    /ffmpeg\.exec\(\s*\[\s*["']-i["']\s*,\s*["']input\.mp4["']\s*\]\s*\)/,
    "an FFmpeg processing invocation must specify an output target",
  );
  assert.match(
    source,
    /["']-vframes["']\s*,\s*["']1["'][\s\S]*outputName/,
    "frame extraction should still invoke FFmpeg with a frame output",
  );
});
