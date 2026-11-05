import assert from "node:assert/strict";
import test from "node:test";
import { parseConvexError } from "../app/lib/convex-error.ts";

test("Convex video authorization failures use the video mapping without changing projects", () => {
  const videoResult = parseConvexError(new Error("Video not found or unauthorized"));
  assert.equal(videoResult.message, "视频不存在或无权限");

  const projectResult = parseConvexError(new Error("Project not found or unauthorized"));
  assert.equal(projectResult.message, "项目不存在或无权限");
});
