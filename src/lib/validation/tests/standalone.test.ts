// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  GENERATED_HEADER,
  generateValidatorsCode,
  withoutType,
} from "../standalone";

describe("generateValidatorsCode", () => {
  it("should generate ESM validators without runtime code generation or require", () => {
    const code = generateValidatorsCode();
    expect(code.startsWith(GENERATED_HEADER)).toBe(true);
    expect(code).toContain("export const validateBrushPreset");
    expect(code).toContain("export const validateBrushPresetCollection");
    expect(code).toContain("export const validateColourPalette");
    expect(code).toContain("export const validateColourPaletteCollection");
    expect(code).toContain("export const validateProfileGraph");
    expect(code).toContain("export const validateProfileGraphCollection");
    expect(code).toContain("export const validatePatchMessage");
    expect(code).toContain("export const validateStrokeMessage");
    expect(code).toContain("export const validateHistoryMessage");
    expect(code).toContain("export const validateDocument");
    expect(code).toContain("export const validateSettings");
    expect(code).toContain("export const validateAppSettings");
    expect(code).not.toMatch(/require\(|new Function|eval\(/);
  });

  it("should match the committed validators file (run build:validators if this fails)", () => {
    const committed = readFileSync(
      new URL("../validators.generated.js", import.meta.url),
      "utf8",
    );
    expect(committed).toBe(generateValidatorsCode());
  });
});

describe("withoutType", () => {
  it("should copy a schema without its @type", () => {
    const schema = { $id: "x", "@type": "PaintCanvas/Test", type: "object" };
    expect(withoutType(schema)).toEqual({ $id: "x", type: "object" });
    expect(schema["@type"]).toBe("PaintCanvas/Test");
  });
});
