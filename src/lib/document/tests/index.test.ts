import { describe, it, expect } from "vitest";
import { Ajv } from "ajv";
import {
  DOCUMENT_BLEND_MODES,
  documentSchema,
  isValidDocument,
  type PaintCanvasDocument,
} from "..";
import { BlendMode } from "../../classes/Layer";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const document: PaintCanvasDocument = {
  format: "paintcanvas-document",
  version: 1,
  width: 100,
  height: 50,
  layers: [
    {
      name: "Sketch",
      visible: true,
      opacity: 0.5,
      blendMode: "multiply",
      alphaLock: false,
      image: PNG,
    },
  ],
  activeLayer: 0,
  external: [{ source: "ann", image: PNG }],
};

describe("document schema", () => {
  it("should match the blend modes of the canvas", () => {
    expect([...DOCUMENT_BLEND_MODES]).toEqual(Object.values(BlendMode));
  });

  it("should compile and validate documents with ajv", () => {
    const ajv = new Ajv({ strict: true });
    expect(ajv.validate(documentSchema, document)).toBe(true);
    expect(ajv.validate(documentSchema, { ...document, width: 0 })).toBe(false);
    expect(ajv.errors?.[0]?.instancePath).toBe("/width");
  });
});

describe("isValidDocument", () => {
  it("should accept a valid document", () => {
    expect(isValidDocument(document)).toEqual({ valid: true, value: document });
  });

  it.each([
    ["isn't an object", "document", "/ must be object"],
    [
      "is another format",
      { ...document, format: "other" },
      "/format must be equal to constant",
    ],
    [
      "has no layers",
      { ...document, layers: [] },
      "/layers must NOT have fewer than 1 items",
    ],
    [
      "has an image that isn't a PNG",
      {
        ...document,
        external: [{ source: "ann", image: "data:image/gif;base64,R0lGOD" }],
      },
      '/external/0/image must match pattern "^data:image/png;base64,[A-Za-z0-9+/]*={0,2}$"',
    ],
    [
      "selects a layer it doesn't have",
      { ...document, activeLayer: 1 },
      "/activeLayer must be one of the layers",
    ],
  ])("should reject a document that %s", (_label, input, error) => {
    expect(isValidDocument(input)).toEqual({ valid: false, errors: [error] });
  });
});
