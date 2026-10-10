import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/routes/share.$shareId.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("share.$shareId.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = parsed.statements.find(statement =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "loader",
);
assert.ok(declaration, "The share route must export a loader");
const { outputText } = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});

async function invokeLoader({ env, queryResult = { share: { shareId: "share-123" } } }) {
  const calls = { clients: [], queries: [], errors: [] };
  const queryReference = Symbol("getSharedCanvas");
  const sandbox = {
    exports: {},
    process: { env },
    console: {
      log: () => {},
      error: (...errorArgs) => calls.errors.push(errorArgs),
    },
    Response,
    ConvexHttpClient: class {
      constructor(url) {
        calls.clients.push(url);
      }
      async query(...queryArgs) {
        calls.queries.push(queryArgs);
        return queryResult;
      }
    },
    api: { shares: { getSharedCanvas: queryReference } },
  };
  runInNewContext(outputText, sandbox);

  return {
    calls,
    queryReference,
    result: await sandbox.exports.loader({ params: { shareId: "share-123" } }),
  };
}

test("share loader fails before creating a Convex client without configuration", async () => {
  const calls = { clients: [], queries: [] };
  const sandbox = {
    exports: {},
    process: { env: {} },
    console: { log: () => {}, error: () => {} },
    Response,
    ConvexHttpClient: class {
      constructor(url) {
        calls.clients.push(url);
      }
    },
    api: { shares: { getSharedCanvas: Symbol("getSharedCanvas") } },
  };
  runInNewContext(outputText, sandbox);

  await assert.rejects(
    () => sandbox.exports.loader({ params: { shareId: "share-123" } }),
    /VITE_CONVEX_URL is required for server-side Convex requests/,
  );
  assert.deepEqual(calls.clients, []);
  assert.deepEqual(calls.queries, []);
});

test("share loader queries the configured Convex deployment", async () => {
  const { calls, queryReference, result } = await invokeLoader({
    env: { VITE_CONVEX_URL: " https://convex.example.test " },
  });

  assert.deepEqual(calls.clients, ["https://convex.example.test"]);
  assert.equal(calls.queries.length, 1);
  assert.equal(calls.queries[0][0], queryReference);
  assert.equal(calls.queries[0][1].shareId, "share-123");
  assert.equal(result.shareId, "share-123");
  assert.equal(result.sharedData.share.shareId, "share-123");
});
