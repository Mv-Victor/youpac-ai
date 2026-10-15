import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadDeclarations(relativePath, exportNames) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const parsed = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = parsed.statements.filter(statement =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(item => exportNames.includes(item.name.getText(parsed))),
  );
  assert.equal(declarations.length, exportNames.length, `Expected exports in ${relativePath}`);

  const { outputText } = ts.transpileModule(declarations.map(item => item.getText(parsed)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const register = kind => definition => ({ ...definition, kind });
  const sandbox = {
    exports: {},
    mutation: register("mutation"),
    internalMutation: register("internalMutation"),
    action: register("action"),
    internalAction: register("internalAction"),
    v: new Proxy({}, { get: () => () => ({}) }),
  };
  runInNewContext(outputText, sandbox);
  return sandbox.exports;
}

const media = loadDeclarations("../convex/dreamXMedia.ts", ["addUserMedia", "seedBuiltinMedia"]);
const seeder = loadDeclarations("../convex/dreamXSeeder.ts", ["seedBuiltinMedia"]);
const publicFunctions = new Map(
  Object.entries({
    "dreamXMedia:addUserMedia": media.addUserMedia,
    "dreamXMedia:seedBuiltinMedia": media.seedBuiltinMedia,
    "dreamXSeeder:seedBuiltinMedia": seeder.seedBuiltinMedia,
  }).filter(([, definition]) => definition.kind === "mutation" || definition.kind === "action"),
);

function invokeAsClient(name) {
  const definition = publicFunctions.get(name);
  if (!definition) throw new Error(`Function not found: ${name}`);
  return definition;
}

for (const client of ["unauthenticated", "authenticated ordinary user"]) {
  test(`${client} cannot invoke a public built-in media seeder`, () => {
    assert.throws(() => invokeAsClient("dreamXMedia:seedBuiltinMedia"), /Function not found/);
    assert.throws(() => invokeAsClient("dreamXSeeder:seedBuiltinMedia"), /Function not found/);
  });
}

test("authenticated and unauthenticated user uploads cannot create built-in media", async () => {
  const inserted = [];
  const context = subject => ({
    auth: { getUserIdentity: async () => subject ? { subject } : null },
    db: { insert: async (_table, value) => inserted.push(value) },
  });
  const args = { type: "meme", name: "untrusted", mood: "global", url: "https://example.invalid/payload.gif" };

  await assert.rejects(() => media.addUserMedia.handler(context(null), args), /Unauthorized/);
  await media.addUserMedia.handler(context("ordinary-user"), { ...args, isBuiltin: true });

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].isBuiltin, false);
  assert.equal(inserted[0].userId, "ordinary-user");
});

test("internal built-in media initialization remains functional and idempotent", async () => {
  assert.equal(media.seedBuiltinMedia.kind, "internalMutation");
  assert.equal(seeder.seedBuiltinMedia.kind, "internalAction");

  const rows = [];
  const ctx = {
    auth: { getUserIdentity: async () => null },
    db: {
      query: () => ({
        withIndex: () => ({
          filter: () => ({ first: async () => rows.find(row => row.name === "built-in") ?? null }),
        }),
      }),
      insert: async (_table, value) => rows.push(value),
    },
  };
  const args = { items: [{ type: "meme", name: "built-in", mood: "happy", url: "https://example.invalid/builtin.gif" }] };

  await media.seedBuiltinMedia.handler(ctx, args);
  await media.seedBuiltinMedia.handler(ctx, args);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].isBuiltin, true);
});
