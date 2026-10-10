import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails, VideoError } from "../app/lib/video-error-handler.ts";
import { parseConvexError } from "../app/lib/convex-error.ts";

test("network failures remain recoverable", () => {
  const result = getErrorDetails(new Error("Failed to fetch"));
  assert.equal(result.type, "network");
  assert.equal(result.recoverable, true);
});

test("unsupported formats are not offered an automatic retry", () => {
  const result = getErrorDetails(new Error("codec not supported"));
  assert.equal(result.type, "format");
  assert.equal(result.recoverable, false);
});

test("video errors preserve supplied details", () => {
  const error = new VideoError({ type: "upload", message: "Upload failed", details: "Upload interrupted", recoverable: true });
  assert.equal(error.name, "VideoError");
  assert.equal(error.message, "Upload failed");
  assert.equal(error.details, "Upload interrupted");
});

test("Convex schema failures do not expose the server response", () => {
  const result = parseConvexError(new Error("Object contains extra field: privatePayload"));
  assert.ok(result.description);
  assert.ok(!JSON.stringify(result).includes("privatePayload"));
});

test("unknown Convex failures do not expose internal stack locations", () => {
  const result = parseConvexError(new Error("Uncaught Error: internal detail\n    at async handler (convex/projects.ts:99)"));
  assert.ok(!JSON.stringify(result).includes("convex/projects.ts"));
  assert.ok(!JSON.stringify(result).includes("internal detail"));
});
