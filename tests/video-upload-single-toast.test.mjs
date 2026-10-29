import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("video upload catch owns one toast so retries retain their action", async () => {
  const source = await readFile(new URL("../app/components/canvas/Canvas.tsx", import.meta.url), "utf8");
  const catchStart = source.indexOf('console.error("Upload error:", error);');
  const catchEnd = source.indexOf("\n    }\n  };", catchStart);
  assert.ok(catchStart >= 0, "upload catch block should exist");
  assert.ok(catchEnd > catchStart, "upload catch block should be bounded");

  const uploadCatch = source.slice(catchStart, catchEnd);
  assert.match(uploadCatch, /getErrorDetails\(error\)/);
  assert.doesNotMatch(uploadCatch, /handleVideoError\(error, ['"]Upload['"]\)/);
  assert.match(uploadCatch, /action:\s*\{[\s\S]*label: retryAction\.label/);
  assert.match(uploadCatch, /else\s*\{[\s\S]*toast\.error\(errorDetails\.message/);
});
