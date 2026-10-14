import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function compileLoader(route) {
  const source = readFileSync(new URL(`../app/routes/${route}`, import.meta.url), "utf8");
  const parsed = ts.createSourceFile(route, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = parsed.statements.find(statement =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "loader"
  );
  assert.ok(declaration, `${route} must export a loader`);
  return ts.transpileModule(declaration.getText(parsed), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

const homeLoader = compileLoader("home.tsx");
const shareLoader = compileLoader("share.$shareId.tsx");

async function invokeHome(value) {
  const calls = { clients: [], queries: [] };
  const sandbox = {
    exports: {},
    process: { env: { VITE_CONVEX_URL: value } },
    getAuth: async () => ({ userId: null }),
    ConvexHttpClient: class {
      constructor(url) { calls.clients.push(url); }
      async query(...args) { calls.queries.push(args); return { totalVideos: 1, totalUsers: 2 }; }
    },
    api: { stats: { getHeroStats: Symbol("getHeroStats") } },
    console: { error: () => {} },
  };
  runInNewContext(homeLoader, sandbox);
  return { calls, result: await sandbox.exports.loader({}) };
}

async function invokeShare(value) {
  const calls = { clients: [], queries: [] };
  const sandbox = {
    exports: {},
    process: { env: { VITE_CONVEX_URL: value } },
    ConvexHttpClient: class {
      constructor(url) { calls.clients.push(url); }
      async query(...args) { calls.queries.push(args); return { share: { shareId: "share-123" } }; }
    },
    api: { shares: { getSharedCanvas: Symbol("getSharedCanvas") } },
    console: { log: () => {}, error: () => {} },
    Response,
  };
  runInNewContext(shareLoader, sandbox);
  return { calls, load: () => sandbox.exports.loader({ params: { shareId: "share-123" } }) };
}

for (const [name, value] of [["spaces", "   "], ["tabs", "\t\t"]]) {
  test(`homepage treats ${name}-only Convex configuration as missing`, async () => {
    const { calls, result } = await invokeHome(value);
    assert.equal(result.initialStats, null);
    assert.deepEqual(calls.clients, []);
    assert.deepEqual(calls.queries, []);
  });

  test(`share loader rejects ${name}-only Convex configuration before client creation`, async () => {
    const { calls, load } = await invokeShare(value);
    await assert.rejects(load, /VITE_CONVEX_URL is required for server-side Convex requests/);
    assert.deepEqual(calls.clients, []);
    assert.deepEqual(calls.queries, []);
  });
}

for (const [name, invoke] of [["homepage", invokeHome], ["share loader", invokeShare]]) {
  test(`${name} trims valid Convex configuration`, async () => {
    const configured = "https://convex.example.test";
    const invocation = await invoke(` \t${configured}\t `);
    if (invocation.load) await invocation.load();
    assert.deepEqual(invocation.calls.clients, [configured]);
    assert.equal(invocation.calls.queries.length, 1);
  });
}
