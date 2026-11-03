// @vitest-environment node
import { globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

/** The relative modules a file imports (e.g. `../PcButton`, without `/index.js`), or only those it imports just for their side effects */
const relativeImports = (code: string, sideEffectsOnly = false): string[] =>
  [
    ...code.matchAll(
      sideEffectsOnly
        ? /^import "(\.[^"]+)";/gm
        : /^(?:import|export)\s[^"]*?"(\.[^"]+)";/gm,
    ),
  ]
    .map((match) => (match[1] as string).replace(/\/index(\.js)?$/, ""))
    .filter((path) => !path.includes(".css"));

describe("build", () => {
  const outDir = mkdtempSync(join(tmpdir(), "paintcanvas-build-"));

  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it("should keep the imports that register the elements an element uses", async () => {
    await build({ logLevel: "silent", build: { outDir } });
    const sources = globSync("src/ui/**/index.ts", {
      exclude: (path) => path.includes("/tests"),
    });
    for (const source of sources) {
      const expected = relativeImports(readFileSync(source, "utf8"), true);
      const built = join(
        outDir,
        source.replace(/^src\//, "").replace(/\.ts$/, ".js"),
      );
      expect([source, relativeImports(readFileSync(built, "utf8"))]).toEqual([
        source,
        expect.arrayContaining(expected),
      ]);
    }
  }, 120_000);
});
