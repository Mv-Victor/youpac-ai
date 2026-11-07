import assert from "node:assert/strict";
import test from "node:test";
import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("does not classify unrelated words containing auth as authentication failures", () => {
  const result = getErrorDetails(new Error("Authoring failed"));

  assert.notEqual(result.message, "Authentication required");
  assert.equal(result.type, "upload");
  assert.equal(result.recoverable, true);
});
