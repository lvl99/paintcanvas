// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import {
  GENERATED_HEADER,
  generateValidatorsCode,
  shareRepeatedSchemas,
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

describe("shareRepeatedSchemas", () => {
  const point = {
    type: "object",
    required: ["x", "y"],
    properties: { x: { type: "number" }, y: { type: "number" } },
  };
  const shape = {
    $id: "test/shape",
    type: "object",
    properties: { start: point, end: point, label: { type: "string" } },
  };
  const line = { $id: "test/line", type: "array", items: point };

  it("should move sub-schemas used more than once into a shared schema, leaving the originals as they are", () => {
    const [sharedShape, sharedLine, sharedPoint] = shareRepeatedSchemas(
      [shape, line],
      10,
    );
    const ref = { $ref: "urn:paintcanvas:shared:1" };
    expect(sharedShape).toEqual({
      ...shape,
      properties: { start: ref, end: ref, label: { type: "string" } },
    });
    expect(sharedLine).toEqual({ ...line, items: ref });
    expect(sharedPoint).toEqual({ $id: "urn:paintcanvas:shared:1", ...point });
    expect(shape.properties.start).toBe(point);
  });

  it("should validate the same as the schemas it came from", () => {
    const schemas = shareRepeatedSchemas([shape, line], 10);
    const ajv = new Ajv2020({ strict: true, schemas });
    const validate = ajv.getSchema("test/shape")!;
    expect(validate({ start: { x: 1, y: 2 }, end: { x: 3, y: 4 } })).toBe(true);
    expect(validate({ start: { x: 1 } })).toBe(false);
    expect(validate.errors?.[0]?.instancePath).toBe("/start");
  });

  it("should leave small sub-schemas, values that aren't schemas, and maps of schemas in place", () => {
    const values = ["a", "b"];
    const properties = { a: { type: "string" } };
    const schemas = shareRepeatedSchemas([
      { $id: "test/a", enum: values, properties, items: point },
      { $id: "test/b", enum: values, properties, items: point },
    ]);
    expect(schemas).toHaveLength(2);
    expect(schemas[0]).toEqual({
      $id: "test/a",
      enum: values,
      properties,
      items: point,
    });
  });
});
