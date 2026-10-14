import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../convex/videos.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("videos.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = parsed.statements.find(statement =>
  ts.isVariableStatement(statement)
  && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
  && statement.declarationList.declarations.some(item => item.name.getText(parsed) === "create"),
);
assert.ok(declaration, "videos.ts must export the create mutation");
const createDeclaration = declaration.declarationList.declarations.find(item => item.name.getText(parsed) === "create");
const handler = createDeclaration.initializer.arguments[0].properties.find(property => property.name?.getText(parsed) === "handler");
assert.ok(handler && ts.isPropertyAssignment(handler), "videos.create must define a handler");
const { outputText } = ts.transpileModule(`exports.handler = ${handler.initializer.getText(parsed)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const sandbox = { exports: {} };
runInNewContext(outputText, sandbox);

const baseArgs = {
  projectId: "project-123",
  title: "Test video",
  canvasPosition: { x: 10, y: 20 },
};

async function invokeCreate({ identity = { subject: "owner-user" }, project, videoUrl, storageId } = {}) {
  const calls = [];
  const insertedVideo = { _id: "video-123", projectId: baseArgs.projectId };
  const ctx = {
    auth: {
      getUserIdentity: async () => {
        calls.push(["identity"]);
        return identity;
      },
    },
    db: {
      get: async id => {
        calls.push(["get", id]);
        if (id === baseArgs.projectId) return project;
        if (id === insertedVideo._id) return insertedVideo;
        return null;
      },
      insert: async (table, value) => {
        calls.push(["insert", table, value]);
        return insertedVideo._id;
      },
    },
    storage: {
      getUrl: async id => {
        calls.push(["getUrl", id]);
        return `https://storage.example.test/${id}`;
      },
    },
  };

  const result = await sandbox.exports.handler(ctx, { ...baseArgs, videoUrl, storageId });
  return { calls, result };
}

test("video creation rejects unauthenticated access before reading the project", async () => {
  const calls = [];
  const ctx = {
    auth: { getUserIdentity: async () => null },
    db: {
      get: async (...args) => calls.push(["get", ...args]),
      insert: async (...args) => calls.push(["insert", ...args]),
    },
    storage: { getUrl: async (...args) => calls.push(["getUrl", ...args]) },
  };

  await assert.rejects(() => sandbox.exports.handler(ctx, baseArgs), /Unauthorized/);
  assert.deepEqual(calls, []);
});

for (const [name, project] of [
  ["missing", null],
  ["foreign-owned", { _id: baseArgs.projectId, userId: "victim-user" }],
]) {
  test(`video creation rejects a ${name} project before storage or insertion`, async () => {
    const calls = [];
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: "attacker-user" }) },
      db: {
        get: async id => {
          calls.push(["get", id]);
          return project;
        },
        insert: async (...args) => calls.push(["insert", ...args]),
      },
      storage: { getUrl: async (...args) => calls.push(["getUrl", ...args]) },
    };

    await assert.rejects(
      () => sandbox.exports.handler(ctx, { ...baseArgs, storageId: "storage-123" }),
      /Project not found or unauthorized/,
    );
    assert.deepEqual(calls, [["get", baseArgs.projectId]]);
  });
}

test("video creation accepts a direct URL for an owned project", async () => {
  const directUrl = "https://video.example.test/direct.mp4";
  const { calls, result } = await invokeCreate({
    project: { _id: baseArgs.projectId, userId: "owner-user" },
    videoUrl: directUrl,
  });

  assert.equal(result._id, "video-123");
  assert.deepEqual(calls.slice(0, 2), [["identity"], ["get", baseArgs.projectId]]);
  assert.equal(calls.some(([operation]) => operation === "getUrl"), false);
  const insert = calls.find(([operation]) => operation === "insert");
  assert.equal(insert[1], "videos");
  assert.equal(insert[2].userId, "owner-user");
  assert.equal(insert[2].projectId, baseArgs.projectId);
  assert.equal(insert[2].videoUrl, directUrl);
});

test("video creation resolves storage only after confirming project ownership", async () => {
  const storageId = "storage-123";
  const { calls } = await invokeCreate({
    project: { _id: baseArgs.projectId, userId: "owner-user" },
    videoUrl: "https://video.example.test/original.mp4",
    storageId,
  });

  assert.deepEqual(calls.slice(0, 3), [
    ["identity"],
    ["get", baseArgs.projectId],
    ["getUrl", storageId],
  ]);
  const insert = calls.find(([operation]) => operation === "insert");
  assert.equal(insert[2].videoUrl, `https://storage.example.test/${storageId}`);
  assert.equal(insert[2].fileId, storageId);
});
