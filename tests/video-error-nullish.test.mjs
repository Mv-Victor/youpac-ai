import assert from "node:assert/strict";
import test from "node:test";
import {
  formatErrorForDisplay,
  getErrorDetails,
  handleVideoError,
  isRecoverableError,
} from "../app/lib/video-error-handler.ts";

const expectedFallback = {
  type: "upload",
  message: "Something went wrong",
  details: "An unexpected error occurred. Please try again.",
  recoverable: true,
};

for (const rejection of [null, undefined]) {
  test(`nullish video rejection ${String(rejection)} uses the generic fallback`, () => {
    let details;
    let handled;
    let recoverable;
    let display;

    assert.doesNotThrow(() => {
      details = getErrorDetails(rejection);
      handled = handleVideoError(rejection);
      recoverable = isRecoverableError(rejection);
      display = formatErrorForDisplay(rejection);
    });
    assert.deepEqual(details, expectedFallback);
    assert.deepEqual(handled, expectedFallback);
    assert.equal(recoverable, true);
    assert.equal(display, expectedFallback.details);
  });
}
