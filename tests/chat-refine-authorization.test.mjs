import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../convex/chat.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("chat.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const selected = parsed.statements.filter(statement =>
  (ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(item => item.name.getText(parsed) === "refineContent")) ||
  (ts.isFunctionDeclaration(statement) &&
    ["getRefineSystemPrompt", "extractUpdatedDraft"].includes(statement.name?.text)),
);
assert.equal(selected.length, 3, "chat must export refineContent and its prompt helpers");

const { outputText } = ts.transpileModule(selected.map(statement => statement.getText(parsed)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const references = {
  getById: Symbol("getById"),
  addChatMessage: Symbol("addChatMessage"),
  updateDraft: Symbol("updateDraft"),
};
const providerCalls = [];
const sandbox = {
  exports: {},
  action: definition => definition,
  v: new Proxy({}, { get: () => () => ({}) }),
  api: { agents: references },
  anthropic: model => ({ model }),
  generateText: async options => {
    providerCalls.push(options);
    return { text: "Certainly!\n\nUPDATED TITLE:\nA Better Title" };
  },
  console: { error: () => {} },
};
runInNewContext(outputText, sandbox);
const handler = sandbox.exports.refineContent.handler;

const args = {
  agentId: "agent-123",
  userMessage: "Make it stronger",
  currentDraft: "Old Title",
  agentType: "title",
  chatHistory: [],
};

function context({ subject, agent }) {
  const calls = { queries: [], mutations: [] };
  return {
    calls,
    ctx: {
      auth: { getUserIdentity: async () => subject ? { subject } : null },
      runQuery: async (...queryArgs) => {
        calls.queries.push(queryArgs);
        if (!agent || agent.userId !== subject) throw new Error("Agent not found or unauthorized");
        return agent;
      },
      runMutation: async (...mutationArgs) => calls.mutations.push(mutationArgs),
    },
  };
}

test.beforeEach(() => providerCalls.splice(0));

function assertAuthorizationQuery(calls) {
  assert.equal(calls.queries.length, 1);
  assert.equal(calls.queries[0][0], references.getById);
  assert.equal(calls.queries[0][1].id, args.agentId);
}

test("unauthenticated refinement makes no provider or data calls", async () => {
  const { ctx, calls } = context({ subject: null, agent: null });

  await assert.rejects(() => handler(ctx, args), /Unauthorized/);
  assert.deepEqual(calls, { queries: [], mutations: [] });
  assert.deepEqual(providerCalls, []);
});

test("missing agents are rejected before generation or mutation", async () => {
  const { ctx, calls } = context({ subject: "user-123", agent: null });

  await assert.rejects(() => handler(ctx, args), /Agent not found or unauthorized/);
  assertAuthorizationQuery(calls);
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(providerCalls, []);
});

test("agents owned by another user are rejected before generation or mutation", async () => {
  const { ctx, calls } = context({ subject: "attacker", agent: { userId: "victim" } });

  await assert.rejects(() => handler(ctx, args), /Agent not found or unauthorized/);
  assertAuthorizationQuery(calls);
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(providerCalls, []);
});

test("an owned agent generates content and persists messages and the updated draft", async () => {
  const { ctx, calls } = context({ subject: "owner", agent: { userId: "owner" } });

  const result = await handler(ctx, args);
  assert.equal(result.response, "Certainly!\n\nUPDATED TITLE:\nA Better Title");
  assert.equal(result.updatedDraft, "A Better Title");
  assertAuthorizationQuery(calls);
  assert.equal(providerCalls.length, 1);
  assert.deepEqual(calls.mutations.map(([reference, payload]) => [reference, JSON.parse(JSON.stringify(payload))]), [
    [references.addChatMessage, { id: args.agentId, role: "user", message: args.userMessage }],
    [references.addChatMessage, { id: args.agentId, role: "ai", message: "Certainly!\n\nUPDATED TITLE:\nA Better Title" }],
    [references.updateDraft, { id: args.agentId, draft: "A Better Title", status: "ready" }],
  ]);
});
