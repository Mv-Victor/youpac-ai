import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../convex/videoJobs.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("videoJobs.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = parsed.statements.find(statement =>
  ts.isVariableStatement(statement) &&
  statement.declarationList.declarations.some(item => item.name.getText(parsed) === "scheduleThumbnailGeneration"),
);
assert.ok(declaration, "videoJobs must export scheduleThumbnailGeneration");

const { outputText } = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const backgroundJob = Symbol("generateThumbnailInBackground");
const sandbox = {
  exports: {},
  mutation: definition => definition,
  v: new Proxy({}, { get: () => () => ({}) }),
  internal: { videoJobs: { generateThumbnailInBackground: backgroundJob } },
};
runInNewContext(outputText, sandbox);
const handler = sandbox.exports.scheduleThumbnailGeneration.handler;

const args = {
  videoId: "video-123",
  videoTitle: "Requested title",
  frames: [{ dataUrl: "data:image/jpeg;base64,frame", timestamp: 1.5 }],
};

function context({ subject, video }) {
  const calls = { get: [], schedule: [] };
  return {
    calls,
    ctx: {
      auth: { getUserIdentity: async () => subject ? { subject } : null },
      db: {
        get: async id => {
          calls.get.push(id);
          return video;
        },
      },
      scheduler: {
        runAfter: async (...scheduleArgs) => calls.schedule.push(scheduleArgs),
      },
    },
  };
}

test("unauthenticated users cannot schedule thumbnail generation", async () => {
  const { ctx, calls } = context({ subject: null, video: null });

  await assert.rejects(() => handler(ctx, args), /Unauthorized/);
  assert.deepEqual(calls, { get: [], schedule: [] });
});

test("missing videos cannot schedule thumbnail generation", async () => {
  const { ctx, calls } = context({ subject: "user-123", video: null });

  await assert.rejects(() => handler(ctx, args), /Video not found or unauthorized/);
  assert.deepEqual(calls.get, [args.videoId]);
  assert.deepEqual(calls.schedule, []);
});

test("videos owned by another user cannot schedule thumbnail generation", async () => {
  const video = { userId: "victim", title: "Private", transcription: "Secret", duration: 42 };
  const { ctx, calls } = context({ subject: "attacker", video });

  await assert.rejects(() => handler(ctx, args), /Video not found or unauthorized/);
  assert.deepEqual(calls.get, [args.videoId]);
  assert.deepEqual(calls.schedule, []);
});

test("owned videos schedule thumbnail generation with video context", async () => {
  const video = { userId: "owner", title: "Owned", transcription: "Transcript", duration: 42 };
  const { ctx, calls } = context({ subject: "owner", video });

  assert.equal((await handler(ctx, args)).scheduled, true);
  assert.deepEqual(calls.get, [args.videoId]);
  assert.equal(calls.schedule.length, 1);
  assert.equal(calls.schedule[0][0], 0);
  assert.equal(calls.schedule[0][1], backgroundJob);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.schedule[0][2])), {
    ...args,
    videoData: {
      title: video.title,
      transcription: video.transcription,
      duration: video.duration,
    },
  });
});
