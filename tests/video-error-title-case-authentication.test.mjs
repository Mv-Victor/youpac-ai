import assert from "node:assert/strict";
import test from "node:test";

import { getErrorDetails } from "../app/lib/video-error-handler.ts";

test("title-cased authentication upload errors require sign-in", () => {
  const result = getErrorDetails(
    new Error("Authentication required: upload denied"),
  );

  assert.equal(result.message, "Authentication required");
  assert.equal(result.details, "Please sign in to upload videos.");
  assert.equal(result.recoverable, false);
});
