import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const nonPublicTestAddresses = new Set([
  "10.2.3.4",
  "127.0.0.1",
  "169.254.169.254",
  "192.0.0.8",
  "::1",
  "2001:2::1",
  "3fff::1",
  "fd00::1",
]);
const isNonPublicIp = address => nonPublicTestAddresses.has(address);

const source = readFileSync(new URL("../convex/moodboardUtils.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});

let fetchImpl;
let lookupImpl;
const agents = [];
class MockAgent {
  constructor(options) {
    this.options = options;
    agents.push(this);
  }
  async close() {}
}
const validators = new Proxy({}, { get: () => () => validators });
const sandbox = {
  exports: {},
  require(specifier) {
    if (specifier === "convex/values") return { v: validators };
    if (specifier === "./_generated/server") return { action: definition => definition };
    if (specifier === "./_generated/api") return { api: {} };
    if (specifier === "node:dns/promises") return { lookup: (...args) => lookupImpl(...args) };
    if (specifier === "is-private-ip") return { isNonPublicIp };
    if (specifier === "undici") return { Agent: MockAgent, fetch: (...args) => fetchImpl(...args) };
    if (specifier === "node:net") return import.meta.require?.(specifier);
    throw new Error(`Unexpected import: ${specifier}`);
  },
  Buffer,
  URL,
  Response,
  fetch: (...args) => fetchImpl(...args),
  ReadableStream,
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
  agents.length = 0;
  const calls = { auth: 0, dns: [], fetch: [], connected: [] };
  lookupImpl = async hostname => {
    calls.dns.push(hostname);
    return (dns[hostname] || ["93.184.216.34"]).map(address => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  fetchImpl = async (url, options) => {
    const normalized = String(url);
    calls.fetch.push({ url: normalized, options });
    const hostname = new URL(normalized).hostname.replace(/^\[|\]$/g, "");
    await new Promise((resolve, reject) => {
      options.dispatcher.options.connect.lookup(hostname, { all: true }, (error, addresses) => {
        if (error) reject(error);
        else {
          calls.connected.push(addresses);
          resolve();
        }
      });
    });
    return fetchResponse(normalized);
  };
  return {
    calls,
    ctx: { auth: { getUserIdentity: async () => (calls.auth++, authenticated ? identity : null) } },
  };
}

const consumers = [
  {
    name: "downloadImageAsBase64",
    invoke: (ctx, url) => download(ctx, { url }),
    imageData: result => result.dataUrl,
    rejected: result => assert.match(result.message, /public address|supported image|maximum size/),
  },
  {
    name: "processMoodBoardReferences image",
    invoke: (ctx, url) => processReferences(ctx, { references: [{ type: "image", url }] }),
    imageData: result => result[0].imageData,
    rejected: result => assert.equal(result[0].imageData, null),
  },
  {
    name: "processMoodBoardReferences YouTube thumbnail",
    invoke: (ctx, url) => processReferences(ctx, {
      references: [{ type: "youtube", url: "https://youtube.example/watch?v=1", thumbnail: url }],
    }),
    imageData: result => result[0].imageData,
    rejected: result => assert.equal(result[0].imageData, null),
  },
];

for (const consumer of consumers) {
  test(`${consumer.name} authenticates before making an outbound request`, async () => {
    const { ctx, calls } = setup({ authenticated: false });
    await assert.rejects(() => consumer.invoke(ctx, "https://images.example/photo.png"), /Unauthorized/);
    assert.equal(calls.auth, 1);
    assert.deepEqual(calls.fetch, []);
  });

  for (const [label, url] of [
    ["IPv4 loopback", "http://127.0.0.1/image.png"],
    ["IPv4 private", "http://10.2.3.4/image.png"],
    ["IPv4 link-local", "http://169.254.169.254/image.png"],
    ["IPv4 special-purpose", "http://192.0.0.8/image.png"],
    ["IPv6 loopback", "http://[::1]/image.png"],
    ["IPv6 private", "http://[fd00::1]/image.png"],
    ["IPv6 benchmarking", "http://[2001:2::1]/image.png"],
    ["IPv6 documentation", "http://[3fff::1]/image.png"],
  ]) {
    test(`${consumer.name} rejects ${label} without fetching it`, async () => {
      const { ctx, calls } = setup();
      const result = await consumer.invoke(ctx, url).catch(error => error);
      consumer.rejected(result);
      assert.deepEqual(calls.fetch, []);
    });
  }

  test(`${consumer.name} downloads a public image through its validated address`, async () => {
    const { ctx, calls } = setup({ dns: { "images.example": ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"] } });
    const result = await consumer.invoke(ctx, "https://images.example/photo.png");
    const imageData = consumer.imageData(result);
    assert.match(imageData, /^data:image\/png;base64,/);
    assert.equal(calls.fetch.length, 1);
    assert.equal(JSON.stringify(calls.connected), JSON.stringify([[{ address: "93.184.216.34", family: 4 }]]));
    assert.equal(calls.dns.length, 1);
  });

  test(`${consumer.name} revalidates redirects and never fetches a private target`, async () => {
    const { ctx, calls } = setup({
      fetchResponse: () => response(null, { status: 302, headers: { location: "http://127.0.0.1/private.png" } }),
    });
    const result = await consumer.invoke(ctx, "https://images.example/redirect").catch(error => error);
    consumer.rejected(result);
    assert.deepEqual(calls.fetch.map(call => call.url), ["https://images.example/redirect"]);
  });

  test(`${consumer.name} rejects a non-image response`, async () => {
    const { ctx } = setup({ fetchResponse: () => response("secret", { headers: { "content-type": "text/plain" } }) });
    const result = await consumer.invoke(ctx, "https://images.example/not-image").catch(error => error);
    consumer.rejected(result);
  });

  test(`${consumer.name} stops a streamed response at the size limit`, async () => {
    const oversizedBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6 * 1024 * 1024));
        controller.enqueue(new Uint8Array(6 * 1024 * 1024));
        controller.close();
      },
    });
    const { ctx } = setup({ fetchResponse: () => response(oversizedBody) });
    const result = await consumer.invoke(ctx, "https://images.example/large.png").catch(error => error);
    consumer.rejected(result);
  });
}
