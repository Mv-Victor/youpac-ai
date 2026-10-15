import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const backgroundAction = Symbol("background action");
const internalStatus = Symbol("internal status");
const internalComplete = Symbol("internal complete");
const internalFailed = Symbol("internal failed");
const publicStatus = Symbol("public status");
const publicComplete = Symbol("public complete");
const elevenLabsAction = Symbol("ElevenLabs action");

const references = {
  internal: {
    transcription: { transcribeVideoElevenLabs: elevenLabsAction },
    videoJobs: {
      transcribeInBackground: backgroundAction,
      updateTranscriptionStatus: internalStatus,
      updateTranscription: internalComplete,
      markTranscriptionFailed: internalFailed,
    },
  },
  api: {
    transcription: { transcribeVideoElevenLabs: Symbol("public ElevenLabs action") },
    videos: {
      updateTranscriptionStatus: publicStatus,
      updateVideoTranscription: publicComplete,
    },
  },
};

function exportedHandler(file, name, additions = {}) {
  let source = readFileSync(new URL(`../convex/${file}`, import.meta.url), "utf8");
  source = source.replaceAll("const fetch = (await import('node-fetch')).default;", "");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = parsed.statements.find(statement =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(item => item.name.getText(parsed) === name),
  );
  if (!declaration) return undefined;
  const { outputText } = ts.transpileModule(declaration.getText(parsed), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const sandbox = {
    exports: {},
    action: definition => definition,
    internalAction: definition => definition,
    mutation: definition => definition,
    internalMutation: definition => definition,
    v: new Proxy({}, { get: () => () => ({}) }),
    console: new Proxy({}, { get: () => () => {} }),
    ...references,
    ...additions,
  };
  runInNewContext(outputText, sandbox);
  return sandbox.exports[name].handler;
}

const publicStatusHandler = exportedHandler("videos.ts", "updateTranscriptionStatus");
const publicCompleteHandler = exportedHandler("videos.ts", "updateVideoTranscription");
const internalStatusHandler = exportedHandler("videoJobs.ts", "updateTranscriptionStatus");
const internalCompleteHandler = exportedHandler("videoJobs.ts", "updateTranscription");
const internalFailedHandler = exportedHandler("videoJobs.ts", "markTranscriptionFailed");

function transcriptionHarness({ fileUrl = "https://files.example/video.mp4", responseText = "A complete transcription long enough to pass the basic quality check." } = {}) {
  const patches = [];
  const calls = [];
  const db = { patch: async (...args) => patches.push(args) };
  const mutationContext = { auth: { getUserIdentity: async () => null }, db };
  const handlers = new Map([
    [publicStatus, publicStatusHandler],
    [publicComplete, publicCompleteHandler],
    [internalStatus, internalStatusHandler],
    [internalComplete, internalCompleteHandler],
    [internalFailed, internalFailedHandler],
  ]);
  const fetch = async (_url, options) => options?.method === "HEAD"
    ? { ok: true, status: 200, headers: { get: () => "1024" } }
    : {
        ok: true,
        json: async () => ({ text: responseText, language_code: "en", language_probability: 1, words: [] }),
      };
  const handler = exportedHandler("transcription.ts", "transcribeVideoElevenLabs", {
    fetch,
    process: { env: { ELEVENLABS_API_KEY: "test-key" } },
  });
  const ctx = {
    auth: { getUserIdentity: async () => null },
    storage: { getUrl: async () => fileUrl },
    runMutation: async (reference, args) => {
      calls.push([reference, args]);
      const target = handlers.get(reference);
      if (!target) throw new Error("Unknown mutation reference");
      return target(mutationContext, args);
    },
  };
  return { handler, ctx, calls, patches };
}

const args = { videoId: "video-123", storageId: "storage-123", fileType: "video/mp4", fileName: "video.mp4" };

test("background transcription completes through internal progress and result mutations without an action identity", async () => {
  const { handler, ctx, calls, patches } = transcriptionHarness();

  const result = await handler(ctx, args);

  assert.equal(result.success, true);
  assert.deepEqual(calls.map(([reference]) => reference), [
    internalStatus,
    internalStatus,
    internalStatus,
    internalStatus,
    internalComplete,
  ]);
  assert.equal(patches.at(-1)[0], args.videoId);
  assert.equal(patches.at(-1)[1].transcriptionStatus, "completed");
  assert.match(patches.at(-1)[1].transcription, /complete transcription/);
});

test("background transcription failures persist failed status without an action identity", async () => {
  const { handler, ctx, calls, patches } = transcriptionHarness({ fileUrl: null });

  await assert.rejects(() => handler(ctx, args), /Could not retrieve file URL/);
  assert.deepEqual(calls.map(([reference]) => reference), [internalStatus, internalFailed]);
  assert.equal(patches.at(-1)[1].transcriptionStatus, "failed");
  assert.match(patches.at(-1)[1].transcriptionError, /Could not retrieve file URL/);
});

test("background job invokes the internal transcription action", async () => {
  const handler = exportedHandler("videoJobs.ts", "transcribeInBackground");
  const actionCalls = [];
  const ctx = {
    runAction: async (...callArgs) => {
      actionCalls.push(callArgs);
      return { success: true, transcription: "done" };
    },
    runMutation: async () => assert.fail("failure mutation must not run"),
  };

  await handler(ctx, args);
  assert.equal(actionCalls.length, 1);
  assert.equal(actionCalls[0][0], elevenLabsAction);
  assert.deepEqual({ ...actionCalls[0][1] }, args);
});
