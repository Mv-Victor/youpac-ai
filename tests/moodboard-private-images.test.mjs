import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../convex/moodboardUtils.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});

let fetchImpl;
let lookupImpl;
const validators = new Proxy({}, { get: () => () => validators });
const sandbox = {
  exports: {},
  require(specifier) {
    if (specifier === "convex/values") return { v: validators };
    if (specifier === "./_generated/server") return { action: definition => definition };
    if (specifier === "./_generated/api") return { api: {} };
    if (specifier === "node:dns/promises") return { lookup: (...args) => lookupImpl(...args) };
    if (specifier === "node:net") return import.meta.require?.(specifier);
    throw new Error(`Unexpected import: ${specifier}`);
  },
  Buffer,
  URL,
  Response,
  fetch: (...args) => fetchImpl(...args),
  console: { log() {}, warn() {}, error() {} },
};
// node:net is built in, but import.meta.require is unavailable in ESM.
const { isIP } = await import("node:net");
const originalRequire = sandbox.require;
sandbox.require = specifier => specifier === "node:net" ? { isIP } : originalRequire(specifier);
runInNewContext(outputText, sandbox);

const download = sandbox.exports.downloadImageAsBase64.handler;
const processReferences = sandbox.exports.processMoodBoardReferences.handler;
const identity = { subject: "user-123" };

function response(body = "image", init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "image/png", ...(init.headers || {}) },
  });
}

function setup({ authenticated = true, dns = {}, fetchResponse = () => response() } = {}) {
  const calls = { auth: 0, dns: [], fetch: [] };
  lookupImpl = async hostname => {
    calls.dns.push(hostname);
    return (dns[hostname] || ["93.184.216.34"]).map(address => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  fetchImpl = async (url, options) => {
    const normalized = String(url);
    calls.fetch.push({ url: normalized, options });
    return fetchResponse(normalized);
  };
  return {
    calls,
    ctx: { auth: { getUserIdentity: async () => (calls.auth++, authenticated ? identity : null) } },
  };
}

async function invoke(actionName, ctx, url) {
  if (actionName === "downloadImageAsBase64") return download(ctx, { url });
  return processReferences(ctx, { references: [{ type: "image", url }] });
}

for (const actionName of ["downloadImageAsBase64", "processMoodBoardReferences"]) {
  test(`${actionName} authenticates before making an outbound request`, async () => {
    const { ctx, calls } = setup({ authenticated: false });
    await assert.rejects(() => invoke(actionName, ctx, "https://images.example/photo.png"), /Unauthorized/);
    assert.equal(calls.auth, 1);
    assert.deepEqual(calls.fetch, []);
  });

  for (const [label, url] of [
    ["IPv4 loopback", "http://127.0.0.1/image.png"],
    ["IPv4 private", "http://10.2.3.4/image.png"],
    ["IPv4 link-local", "http://169.254.169.254/image.png"],
    ["IPv6 loopback", "http://[::1]/image.png"],
    ["IPv6 private", "http://[fd00::1]/image.png"],
  ]) {
    test(`${actionName} rejects ${label} without fetching it`, async () => {
      const { ctx, calls } = setup();
      const result = await invoke(actionName, ctx, url).catch(error => error);
      if (actionName === "downloadImageAsBase64") assert.match(result.message, /public address/);
      else assert.equal(result[0].imageData, null);
      assert.deepEqual(calls.fetch, []);
    });
  }

  test(`${actionName} downloads a public image`, async () => {
    const { ctx, calls } = setup({ dns: { "images.example": ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"] } });
    const result = await invoke(actionName, ctx, "https://images.example/photo.png");
    const imageData = actionName === "downloadImageAsBase64" ? result.dataUrl : result[0].imageData;
    assert.match(imageData, /^data:image\/png;base64,/);
    assert.equal(calls.fetch.length, 1);
  });

  test(`${actionName} revalidates redirects and never fetches a private target`, async () => {
    const { ctx, calls } = setup({
      fetchResponse: () => response(null, { status: 302, headers: { location: "http://127.0.0.1/private.png" } }),
    });
    const result = await invoke(actionName, ctx, "https://images.example/redirect").catch(error => error);
    if (actionName === "downloadImageAsBase64") assert.match(result.message, /public address/);
    else assert.equal(result[0].imageData, null);
    assert.deepEqual(calls.fetch.map(call => call.url), ["https://images.example/redirect"]);
  });

  test(`${actionName} rejects a non-image response`, async () => {
    const { ctx } = setup({ fetchResponse: () => response("secret", { headers: { "content-type": "text/plain" } }) });
    const result = await invoke(actionName, ctx, "https://images.example/not-image").catch(error => error);
    if (actionName === "downloadImageAsBase64") assert.match(result.message, /supported image/);
    else assert.equal(result[0].imageData, null);
  });

  test(`${actionName} rejects an oversized response before buffering it`, async () => {
    const { ctx } = setup({ fetchResponse: () => response("small", { headers: { "content-length": String(10 * 1024 * 1024 + 1) } }) });
    const result = await invoke(actionName, ctx, "https://images.example/large.png").catch(error => error);
    if (actionName === "downloadImageAsBase64") assert.match(result.message, /maximum size/);
    else assert.equal(result[0].imageData, null);
  });
}
