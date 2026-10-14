import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../convex/videoJobs.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("videoJobs.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = parsed.statements.find(statement =>
  ts.isVariableStatement(statement) &&
  statement.declarationList.declarations.some(item => item.name.getText(parsed) === "scheduleTranscription"),
);
assert.ok(declaration, "videoJobs must export scheduleTranscription");

const { outputText } = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const backgroundJob = Symbol("transcribeInBackground");
const sandbox = {
  exports: {},
  mutation: definition => definition,
  v: new Proxy({}, { get: () => () => ({}) }),
  internal: { videoJobs: { transcribeInBackground: backgroundJob } },
  console: { log: () => {} },
};
runInNewContext(outputText, sandbox);
const handler = sandbox.exports.scheduleTranscription.handler;

const args = {
  videoId: "video-123",
  storageId: "storage-123",
  fileType: "video/mp4",
  fileSize: 1234,
  fileName: "example.mp4",
};

function context({ subject, video }) {
  const calls = { get: [], patch: [], schedule: [] };
  return {
    calls,
    ctx: {
      auth: { getUserIdentity: async () => subject ? { subject } : null },
      db: {
        get: async id => {
          calls.get.push(id);
          return video;
        },
        patch: async (...patchArgs) => calls.patch.push(patchArgs),
      },
      scheduler: {
        runAfter: async (...scheduleArgs) => calls.schedule.push(scheduleArgs),
      },
    },
  };
}

test("unauthenticated users cannot schedule transcription", async () => {
  const { ctx, calls } = context({ subject: null, video: null });

  await assert.rejects(() => handler(ctx, args), /Unauthorized/);
  assert.deepEqual(calls, { get: [], patch: [], schedule: [] });
});

test("missing videos cannot be patched or scheduled", async () => {
  const { ctx, calls } = context({ subject: "user-123", video: null });

  await assert.rejects(() => handler(ctx, args), /Video not found or unauthorized/);
  assert.deepEqual(calls.get, [args.videoId]);
  assert.deepEqual(calls.patch, []);
  assert.deepEqual(calls.schedule, []);
});

test("videos owned by another user cannot be patched or scheduled", async () => {
  const { ctx, calls } = context({ subject: "attacker", video: { userId: "victim" } });

  await assert.rejects(() => handler(ctx, args), /Video not found or unauthorized/);
  assert.deepEqual(calls.get, [args.videoId]);
  assert.deepEqual(calls.patch, []);
  assert.deepEqual(calls.schedule, []);
});

test("owned videos are marked processing and scheduled", async () => {
  const { ctx, calls } = context({ subject: "owner", video: { userId: "owner" } });

  assert.equal((await handler(ctx, args)).scheduled, true);
  assert.deepEqual(calls.get, [args.videoId]);
  assert.equal(calls.patch.length, 1);
  assert.equal(calls.patch[0][0], args.videoId);
  assert.equal(calls.patch[0][1].transcriptionStatus, "processing");
  assert.deepEqual(calls.schedule, [[0, backgroundJob, args]]);
});
