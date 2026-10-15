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

function invokeLoader(queryImplementation) {
  const sandbox = {
    exports: {},
    process: { env: { VITE_CONVEX_URL: "https://convex.example.test" } },
    console: { log: () => {}, error: () => {} },
    Response,
    ConvexHttpClient: class {
      query(...args) {
        return queryImplementation(...args);
      }
    },
    api: { shares: { getSharedCanvas: Symbol("getSharedCanvas") } },
  };
  runInNewContext(outputText, sandbox);
  return sandbox.exports.loader({ params: { shareId: "missing-share" } });
}

test("share loader distinguishes a missing canvas from a query failure", async () => {
  const missingResponse = await invokeLoader(async () => null).catch(error => error);
  assert.ok(missingResponse instanceof Response);
  assert.equal(missingResponse.status, 404);
  assert.equal(await missingResponse.text(), "Shared canvas not found");

  await assert.rejects(
    () => invokeLoader(async () => { throw new Error("query unavailable"); }),
    error => error instanceof Response && error.status === 500,
    "a genuine Convex query failure should produce an HTTP 500 response",
  );
});
