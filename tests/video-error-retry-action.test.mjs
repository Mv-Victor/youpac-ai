import assert from "node:assert/strict";
import test from "node:test";
import { createRetryAction } from "../app/lib/video-error-handler.ts";

test("retry actions expose and invoke their declared handler callback", () => {
  let retries = 0;
  const action = createRetryAction(() => {
    retries += 1;
  });

  assert.equal(action.label, "Retry");
  assert.equal(typeof action.handler, "function");
  action.handler();
  assert.equal(retries, 1);
});
