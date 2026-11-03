import test from "node:test";
import assert from "node:assert/strict";
import { parseConvexError } from "../app/lib/convex-error.ts";

test("project authorization errors retain their specific mapping", () => {
  assert.deepEqual(
    parseConvexError(new Error("Project not found or unauthorized")),
    { message: "项目不存在或无权限", description: "请刷新页面后重试" },
  );

  assert.deepEqual(
    parseConvexError(new Error("Unauthorized")),
    { message: "请先登录", description: "当前操作需要登录后才能进行" },
  );
});
