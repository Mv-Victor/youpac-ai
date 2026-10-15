import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../convex/thumbnailRefine.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("thumbnailRefine.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = parsed.statements.find(statement =>
  ts.isVariableStatement(statement) &&
  statement.declarationList.declarations.some(item => item.name.getText(parsed) === "refineThumbnail"),
);
assert.ok(declaration, "thumbnailRefine must export refineThumbnail");

const { outputText } = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});

const agentQuery = Symbol("agents.getById");
let activeCalls;
class OpenAI {
  constructor() {
    activeCalls.provider.push("construct");
    this.chat = {
      completions: {
        create: async () => {
          activeCalls.provider.push("chat.completions.create");
          return { choices: [{ message: { content: "Existing thumbnail analysis" } }] };
        },
      },
    };
    this.images = {
      edit: async () => {
        activeCalls.provider.push("images.edit");
        return { data: [{ b64_json: "aW1hZ2U=" }] };
      },
      generate: async () => {
        activeCalls.provider.push("images.generate");
        return { data: [{ b64_json: "aW1hZ2U=" }] };
      },
    };
  }
}

const sandbox = {
  exports: {},
  action: definition => definition,
  v: new Proxy({}, { get: () => () => ({}) }),
  api: { agents: { getById: agentQuery }, videos: { getWithTranscription: Symbol("videos.getWithTranscription") } },
  OpenAI,
  toFile: async () => ({ name: "current-thumbnail.png" }),
  process: { env: { OPENAI_API_KEY: "test-key" } },
  fetch: async url => {
    activeCalls.fetch.push(url);
    return { ok: true, blob: async () => new Blob(["thumbnail"], { type: "image/png" }) };
  },
  Blob,
  Uint8Array,
  atob,
  console: { log: () => {}, warn: () => {}, error: () => {} },
};
runInNewContext(outputText, sandbox);
const handler = sandbox.exports.refineThumbnail.handler;

const args = {
  agentId: "agent-123",
  currentThumbnailUrl: "https://example.test/current.png",
  userMessage: "Make the title larger",
};

function context({ subject, agent }) {
  const calls = { queries: [], provider: [], fetch: [], storage: [] };
  activeCalls = calls;
  return {
    calls,
    ctx: {
      auth: { getUserIdentity: async () => subject ? { subject } : null },
      runQuery: async (query, queryArgs) => {
        calls.queries.push([query, queryArgs]);
        if (!agent || agent.userId !== subject) throw new Error("Agent not found or unauthorized");
        return agent;
      },
      storage: {
        store: async blob => {
          calls.storage.push(["store", blob.size]);
          return "storage-123";
        },
        getUrl: async id => {
          calls.storage.push(["getUrl", id]);
          return "https://example.test/refined.png";
        },
      },
    },
  };
}

function assertNoExternalSideEffects(calls) {
  assert.deepEqual(calls.provider, []);
  assert.deepEqual(calls.fetch, []);
  assert.deepEqual(calls.storage, []);
}

function assertAgentLookup(calls) {
  assert.equal(calls.queries.length, 1);
  assert.equal(calls.queries[0][0], agentQuery);
  assert.equal(calls.queries[0][1].id, args.agentId);
}

test("unauthenticated callers are rejected before agent lookup or external calls", async () => {
  const { ctx, calls } = context({ subject: null, agent: null });

  await assert.rejects(() => handler(ctx, args), /Unauthorized/);
  assert.deepEqual(calls.queries, []);
  assertNoExternalSideEffects(calls);
});

test("missing agents are rejected before provider, fetch, or storage calls", async () => {
  const { ctx, calls } = context({ subject: "owner", agent: null });

  await assert.rejects(() => handler(ctx, args), /Agent not found or unauthorized/);
  assertAgentLookup(calls);
  assertNoExternalSideEffects(calls);
});

test("foreign-owned agents are rejected before provider, fetch, or storage calls", async () => {
  const { ctx, calls } = context({ subject: "attacker", agent: { userId: "victim", type: "thumbnail" } });

  await assert.rejects(() => handler(ctx, args), /Agent not found or unauthorized/);
  assertAgentLookup(calls);
  assertNoExternalSideEffects(calls);
});

test("owned thumbnail agents can be refined", async () => {
  const { ctx, calls } = context({ subject: "owner", agent: { userId: "owner", type: "thumbnail" } });

  const result = await handler(ctx, args);

  assert.equal(result.imageUrl, "https://example.test/refined.png");
  assert.equal(result.storageId, "storage-123");
  assertAgentLookup(calls);
  assert.deepEqual(calls.provider, ["construct", "chat.completions.create", "images.edit"]);
  assert.deepEqual(calls.fetch, [args.currentThumbnailUrl]);
  assert.deepEqual(calls.storage, [["store", 5], ["getUrl", "storage-123"]]);
});
