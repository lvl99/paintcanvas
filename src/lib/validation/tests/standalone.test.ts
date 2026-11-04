// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GENERATED_HEADER, generateValidatorsCode } from "../standalone";

describe("generateValidatorsCode", () => {
  it("should generate ESM validators without runtime code generation or require", () => {
    const code = generateValidatorsCode();
    expect(code.startsWith(GENERATED_HEADER)).toBe(true);
    expect(code).toContain("export const validateBrushPreset");
    expect(code).toContain("export const validateBrushPresetFile");
    expect(code).toContain("export const validatePatchMessage");
    expect(code).toContain("export const validateStrokeMessage");
    expect(code).toContain("export const validateHistoryMessage");
    expect(code).toContain("export const validateDocument");
    expect(code).toContain("export const validatePaletteFile");
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
