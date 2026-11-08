import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("test-time loaders have installable runtime dependencies", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const lockfile = JSON.parse(
    await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  );

  assert.ok(
    packageJson.dependencies?.typescript,
    "typescript must be a production dependency because tests import it directly",
  );
  for (const dependency of ["sonner", "typescript"]) {
    assert.ok(
      lockfile.packages?.[`node_modules/${dependency}`],
      `${dependency} must be represented in the committed lockfile`,
    );
  }
});
