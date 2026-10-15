import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../convex/debug.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("debug.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = parsed.statements.find(statement =>
  ts.isVariableStatement(statement) &&
  statement.declarationList.declarations.some(item => item.name.getText(parsed) === "getAllTranscriptions"),
);
assert.ok(declaration, "debug must export getAllTranscriptions");

const { outputText } = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const sandbox = {
  exports: {},
  query: definition => definition,
};
runInNewContext(outputText, sandbox);
const handler = sandbox.exports.getAllTranscriptions.handler;

const records = [
  { _id: "owner-transcription", userId: "owner", fullText: "owner transcript" },
  { _id: "victim-transcription", userId: "victim", fullText: "private victim transcript" },
];

function context(subject) {
  const calls = { query: 0, index: [] };
  return {
    calls,
    ctx: {
      auth: { getUserIdentity: async () => subject ? { subject } : null },
      db: {
        query: table => {
          calls.query += 1;
          assert.equal(table, "transcriptions");
          return {
            collect: async () => records,
            withIndex: (index, select) => {
              const builder = {
                eq: (field, value) => {
                  calls.index.push({ index, field, value });
                  return { field, value };
                },
              };
              const selection = select(builder);
              return {
                collect: async () => records.filter(record => record[selection.field] === selection.value),
              };
            },
          };
        },
      },
    },
  };
}

test("unauthenticated requests reject before querying transcription data", async () => {
  const { ctx, calls } = context(null);

  await assert.rejects(() => handler(ctx), /Unauthorized/);
  assert.equal(calls.query, 0);
  assert.deepEqual(calls.index, []);
});

test("authenticated users cannot receive another user's transcriptions", async () => {
  const { ctx } = context("attacker");

  const result = await handler(ctx);
  assert.deepEqual(result, []);
});

test("authenticated users receive only their own transcriptions", async () => {
  const { ctx, calls } = context("owner");

  const result = await handler(ctx);
  assert.deepEqual(result, [records[0]]);
  assert.deepEqual(calls.index, [{ index: "by_user", field: "userId", value: "owner" }]);
});
