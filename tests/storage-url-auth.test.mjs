import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadHandler(relativePath, exportName) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const parsed = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = parsed.statements.find(statement =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(item => item.name.getText(parsed) === exportName),
  );
  assert.ok(declaration, `${relativePath} must export ${exportName}`);

  const { outputText } = ts.transpileModule(declaration.getText(parsed), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const sandbox = {
    exports: {},
    action: definition => definition,
    query: definition => definition,
    v: new Proxy({}, { get: () => () => ({}) }),
  };
  runInNewContext(outputText, sandbox);
  return sandbox.exports[exportName].handler;
}

const handlers = [
  ["files.getUrl", loadHandler("../convex/files.ts", "getUrl")],
  ["dreamXCanvas.getStorageFileUrl", loadHandler("../convex/dreamXCanvas.ts", "getStorageFileUrl")],
];

function context(identity) {
  const calls = { auth: 0, storage: [] };
  return {
    calls,
    ctx: {
      auth: {
        getUserIdentity: async () => {
          calls.auth += 1;
          return identity;
        },
      },
      storage: {
        getUrl: async storageId => {
          calls.storage.push(storageId);
          return `https://storage.example/${storageId}`;
        },
      },
    },
  };
}

for (const [name, handler] of handlers) {
  test(`${name} rejects unauthenticated requests without storage access`, async () => {
    const { ctx, calls } = context(null);

    await assert.rejects(() => handler(ctx, { storageId: "private-file" }), /Unauthorized/);
    assert.equal(calls.auth, 1);
    assert.deepEqual(calls.storage, []);
  });

  test(`${name} resolves the requested storage URL for authenticated users`, async () => {
    const { ctx, calls } = context({ subject: "user-123" });

    assert.equal(
      await handler(ctx, { storageId: "owned-file" }),
      "https://storage.example/owned-file",
    );
    assert.equal(calls.auth, 1);
    assert.deepEqual(calls.storage, ["owned-file"]);
  });
}
