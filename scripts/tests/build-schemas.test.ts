// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PUBLISHED_SCHEMAS,
  changedSchemaFiles,
  schemaFiles,
  writeSchemaFiles,
} from "../build-schemas.ts";
import { SCHEMA_BASE_URL } from "../../src/lib/schemas/index.ts";

describe("build schemas", () => {
  it("should name each schema's file by its published URL", () => {
    const files = schemaFiles();
    expect([...files.keys()]).toEqual([
      "brush-preset-2.1.0.json",
      "brush-preset-collection-2.1.0.json",
      "colour-palette-2.1.0.json",
      "colour-palette-collection-2.1.0.json",
      "profile-graph-2.1.0.json",
      "profile-graph-collection-2.1.0.json",
      "document-1.1.0.json",
      "app-settings-2.2.0.json",
    ]);
    for (const schema of PUBLISHED_SCHEMAS) {
      const json = JSON.parse(
        files.get(schema.$id.slice(SCHEMA_BASE_URL.length))!,
      );
      expect(json).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: schema.$id,
        "@type": expect.stringMatching(/^PaintCanvas\//),
      });
    }
  });

  it("should refuse schemas that aren't published", () => {
    expect(() => schemaFiles([{ $id: "https://example.com/a.json" }])).toThrow(
      "isn't published",
    );
  });

  it("should match the committed schema files (run build:schemas, or give a changed schema a new version)", () => {
    expect(changedSchemaFiles()).toEqual([]);
    for (const name of schemaFiles().keys())
      expect(
        existsSync(new URL(`../../schemas/${name}`, import.meta.url)),
      ).toBe(true);
  });

  it("should write new versions only, and refuse to change a published version", () => {
    const path = mkdtempSync(join(tmpdir(), "paintcanvas-schemas-"));
    const files = new Map([["a-1.0.0.json", "{}\n"]]);
    expect(writeSchemaFiles(files, path)).toEqual(["a-1.0.0.json"]);
    expect(writeSchemaFiles(files, path)).toEqual([]);
    expect(readFileSync(join(path, "a-1.0.0.json"), "utf8")).toBe("{}\n");
    writeFileSync(join(path, "a-1.0.0.json"), "{ }\n");
    expect(changedSchemaFiles(files, path)).toEqual(["a-1.0.0.json"]);
    expect(() => writeSchemaFiles(files, path)).toThrow(
      "Published schemas can't change; give them a new version: a-1.0.0.json",
    );
  });
});
