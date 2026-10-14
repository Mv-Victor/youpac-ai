import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../convex/transcriptions.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("transcriptions.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = parsed.statements.find(statement =>
  ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(item => item.name.getText(parsed) === "create")
);
assert.ok(declaration, "The transcriptions module must export create");

const { outputText } = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const validator = () => Symbol("validator");
const sandbox = {
  exports: {},
  mutation: definition => definition,
  v: {
    id: validator,
    optional: validator,
    string: validator,
    number: validator,
    array: validator,
    object: validator,
  },
  console: { log: () => {} },
};
runInNewContext(outputText, sandbox);
const handler = sandbox.exports.create.handler;

const baseArgs = {
  projectId: "project-owned",
  fileName: "captions.vtt",
  format: "vtt",
  fullText: "Hello world",
  wordCount: 2,
  canvasPosition: { x: 10, y: 20 },
};

function createContext({ userId = "owner", records = {} } = {}) {
  const calls = { gets: [], inserts: [] };
  return {
    calls,
    ctx: {
      auth: {
        getUserIdentity: async () => userId === null ? null : { subject: userId },
      },
      db: {
        get: async id => {
          calls.gets.push(id);
          return records[id] ?? null;
        },
        insert: async (...args) => {
          calls.inserts.push(args);
          return "transcription-created";
        },
      },
    },
  };
}

test("transcription creation rejects unauthenticated access before reading or writing", async () => {
  const { ctx, calls } = createContext({ userId: null });

  await assert.rejects(() => handler(ctx, baseArgs), /Unauthorized/);
  assert.deepEqual(calls.gets, []);
  assert.deepEqual(calls.inserts, []);
});

test("transcription creation rejects a missing project without inserting", async () => {
  const { ctx, calls } = createContext();

  await assert.rejects(() => handler(ctx, baseArgs), /Project not found or unauthorized/);
  assert.deepEqual(calls.gets, [baseArgs.projectId]);
  assert.deepEqual(calls.inserts, []);
});

test("transcription creation rejects a project owned by another user", async () => {
  const { ctx, calls } = createContext({
    userId: "attacker",
    records: { [baseArgs.projectId]: { _id: baseArgs.projectId, userId: "victim" } },
  });

  await assert.rejects(() => handler(ctx, baseArgs), /Project not found or unauthorized/);
  assert.deepEqual(calls.gets, [baseArgs.projectId]);
  assert.deepEqual(calls.inserts, []);
});

test("transcription creation succeeds for a project owned by the authenticated user", async () => {
  const { ctx, calls } = createContext({
    records: { [baseArgs.projectId]: { _id: baseArgs.projectId, userId: "owner" } },
  });

  assert.equal(await handler(ctx, baseArgs), "transcription-created");
  assert.deepEqual(calls.gets, [baseArgs.projectId]);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0][0], "transcriptions");
  assert.equal(calls.inserts[0][1].userId, "owner");
  assert.equal(calls.inserts[0][1].projectId, baseArgs.projectId);
});

for (const [caseName, video] of [
  ["that does not exist", null],
  ["owned by another user", { _id: "video", userId: "victim", projectId: baseArgs.projectId }],
  ["from another project", { _id: "video", userId: "owner", projectId: "another-project" }],
]) {
  test(`transcription creation rejects a video ${caseName}`, async () => {
    const args = { ...baseArgs, videoId: "video" };
    const { ctx, calls } = createContext({
      records: {
        [baseArgs.projectId]: { _id: baseArgs.projectId, userId: "owner" },
        ...(video ? { video } : {}),
      },
    });

    await assert.rejects(() => handler(ctx, args), /Video not found or unauthorized/);
    assert.deepEqual(calls.gets, [baseArgs.projectId, args.videoId]);
    assert.deepEqual(calls.inserts, []);
  });
}

test("transcription creation accepts a video owned by the user in the same project", async () => {
  const args = { ...baseArgs, videoId: "video" };
  const { ctx, calls } = createContext({
    records: {
      [baseArgs.projectId]: { _id: baseArgs.projectId, userId: "owner" },
      video: { _id: "video", userId: "owner", projectId: baseArgs.projectId },
    },
  });

  assert.equal(await handler(ctx, args), "transcription-created");
  assert.deepEqual(calls.gets, [baseArgs.projectId, args.videoId]);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0][1].videoId, args.videoId);
});
