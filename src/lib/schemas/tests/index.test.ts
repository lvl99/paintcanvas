import { describe, it, expect } from "vitest";
import {
  SCHEMA_BASE_URL,
  compareVersions,
  majorVersion,
  parseSchemaUrl,
  schemaUrl,
} from "..";

describe("schemaUrl and parseSchemaUrl", () => {
  it("should name a schema's URL by its name and version, and read them back", () => {
    const url = schemaUrl("brush-preset", "1.0.0");
    expect(url).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/brush-preset-1.0.0.json",
    );
    expect(parseSchemaUrl(url)).toEqual({
      name: "brush-preset",
      version: "1.0.0",
    });
    expect(
      parseSchemaUrl(schemaUrl("brush-preset-collection", "2.10.3")),
    ).toEqual({
      name: "brush-preset-collection",
      version: "2.10.3",
    });
  });

  it.each([
    [
      "another site's URL",
      "https://example.com/schemas/brush-preset-1.0.0.json",
    ],
    ["a URL without a version", `${SCHEMA_BASE_URL}brush-preset.json`],
    ["a URL with a partial version", `${SCHEMA_BASE_URL}brush-preset-1.0.json`],
    ["a value that isn't text", 1],
    ["no value", undefined],
  ])("should not read %s", (_label, url) => {
    expect(parseSchemaUrl(url)).toBeUndefined();
  });
});

describe("compareVersions", () => {
  it("should order versions by major, minor then patch", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.1", "1.0.2")).toBeLessThan(0);
  });

  it("should put versions it can't read first", () => {
    expect(compareVersions("legacy-1", "0.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "x")).toBeGreaterThan(0);
  });
});

describe("majorVersion", () => {
  it("should read the major version, or NaN for one it can't read", () => {
    expect(majorVersion("3.2.1")).toBe(3);
    expect(majorVersion("legacy-1")).toBeNaN();
  });
});
