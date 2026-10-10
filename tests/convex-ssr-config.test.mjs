import assert from "node:assert/strict";
import test from "node:test";

import { getConvexServerUrl } from "../app/lib/convex-server.ts";

test("server-side Convex configuration fails closed without a URL", () => {
  const originalUrl = process.env.VITE_CONVEX_URL;
  delete process.env.VITE_CONVEX_URL;

  try {
    assert.throws(
      () => getConvexServerUrl(),
      /VITE_CONVEX_URL is required for server-side Convex requests/,
    );
  } finally {
    if (originalUrl === undefined) delete process.env.VITE_CONVEX_URL;
    else process.env.VITE_CONVEX_URL = originalUrl;
  }
});

test("server-side Convex configuration uses the configured URL", () => {
  const originalUrl = process.env.VITE_CONVEX_URL;
  process.env.VITE_CONVEX_URL = " https://convex.example.test ";

  try {
    assert.equal(getConvexServerUrl(), "https://convex.example.test");
  } finally {
    if (originalUrl === undefined) delete process.env.VITE_CONVEX_URL;
    else process.env.VITE_CONVEX_URL = originalUrl;
  }
});
