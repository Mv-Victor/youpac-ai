import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/routes/home.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("home.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = parsed.statements.find(statement =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "loader"
);
assert.ok(declaration, "The homepage must export a loader");
const { outputText } = ts.transpileModule(declaration.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});

async function invokeLoader({ userId, env, queryError }) {
  const calls = { auth: [], clients: [], queries: [], errors: [] };
  const args = { request: { url: "http://localhost/" }, params: {} };
  const stats = { totalVideos: 42, totalUsers: 7 };
  const queryReference = Symbol("getHeroStats");
  const sandbox = {
    exports: {},
    process: { env },
    getAuth: async receivedArgs => {
      calls.auth.push(receivedArgs);
      return { userId };
    },
    ConvexHttpClient: class {
      constructor(url) {
        calls.clients.push(url);
      }
      async query(...queryArgs) {
        calls.queries.push(queryArgs);
        if (queryError) throw queryError;
        return stats;
      }
    },
    api: { stats: { getHeroStats: queryReference } },
    console: { error: (...errorArgs) => calls.errors.push(errorArgs) },
  };
  runInNewContext(outputText, sandbox);
  const result = await sandbox.exports.loader(args);
  assert.deepEqual(calls.auth, [args]);
  assert.equal(result.isSignedIn, Boolean(userId));
  return { result, calls, stats, queryReference };
}

for (const userId of [null, "test-user"]) {
  const authState = userId ? "signed in" : "signed out";
  for (const [configState, env] of [
    ["absent", {}],
    ["empty", { VITE_CONVEX_URL: "" }],
    ["spaces-only", { VITE_CONVEX_URL: "   " }],
    ["tabs-only", { VITE_CONVEX_URL: "\t\t" }],
  ]) {
    test(`${authState}, ${configState} configuration skips Convex entirely`, async () => {
      const { result, calls } = await invokeLoader({ userId, env });
      assert.deepEqual(calls.clients, []);
      assert.deepEqual(calls.queries, []);
      assert.deepEqual(calls.errors, []);
      assert.equal(result.initialStats, null);
    });
  }

  test(`${authState}, padded explicit configuration returns queried stats`, async () => {
    const env = { VITE_CONVEX_URL: " \thttp://127.0.0.1:3210\t " };
    const { result, calls, stats, queryReference } = await invokeLoader({ userId, env });
    assert.deepEqual(calls.clients, ["http://127.0.0.1:3210"]);
    assert.deepEqual(calls.queries, [[queryReference]]);
    assert.deepEqual(calls.errors, []);
    assert.equal(result.initialStats, stats);
  });

  test(`${authState}, query failure returns null stats`, async () => {
    const env = { VITE_CONVEX_URL: "http://127.0.0.1:3210" };
    const queryError = new Error("Mock query failure");
    const { result, calls, queryReference } = await invokeLoader({ userId, env, queryError });
    assert.deepEqual(calls.clients, [env.VITE_CONVEX_URL]);
    assert.deepEqual(calls.queries, [[queryReference]]);
    assert.deepEqual(calls.errors, [["Error fetching stats:", queryError]]);
    assert.equal(result.initialStats, null);
  });
}
