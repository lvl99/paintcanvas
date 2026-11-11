import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import validPreset from "./brushPreset-valid.data.json";
import {
  BRUSH_PRESET_COLLECTION_TYPE,
  BRUSH_PRESET_TYPE,
  MAX_PRESETS_PER_FILE,
  MAX_SHAPE_DATA_URL_LENGTH,
  brushPresetCollectionSchema,
  brushPresetSchema,
  formatErrors,
  isValidBrushPreset,
} from "../index";
import { profileGraphSchema } from "../../profiles/schema";
import { withoutType } from "../../validation/standalone";

/** A preset collection file with the given presets */
const file = (items: unknown[]) => ({
  $schema: brushPresetCollectionSchema.$id,
  "@type": BRUSH_PRESET_COLLECTION_TYPE,
  items,
});

/** The valid preset with changes (undefined removes a property) */
const withChanges = (changes: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries({ ...structuredClone(validPreset), ...changes }).filter(
      ([, value]) => value !== undefined,
    ),
  );

describe("brush preset schemas", () => {
  const ajv = new Ajv2020({
    strict: true,
    schemas: [profileGraphSchema, brushPresetSchema].map(withoutType),
  });
  const validatePreset = ajv.getSchema(brushPresetSchema.$id)!;
  const validateFile = ajv.compile(withoutType(brushPresetCollectionSchema));

  it("should be published with a versioned URL and a type", () => {
    expect(brushPresetSchema.$id).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/brush-preset-1.0.0.json",
    );
    expect(brushPresetSchema["@type"]).toBe("PaintCanvas/BrushConfig");
    expect(brushPresetCollectionSchema.$id).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/brush-preset-collection-1.0.0.json",
    );
    expect(brushPresetCollectionSchema["@type"]).toBe(
      "PaintCanvas/BrushConfigCollection",
    );
  });

  it("should compile in ajv strict mode and validate presets and files", () => {
    expect(validatePreset(validPreset)).toBe(true);
    expect(
      validatePreset({
        ...validPreset,
        $schema: brushPresetSchema.$id,
        "@type": BRUSH_PRESET_TYPE,
      }),
    ).toBe(true);
    expect(validateFile(file([validPreset]))).toBe(true);
    expect(validateFile(file([]))).toBe(true);
    expect(validatePreset({ id: "not a UUID" })).toBe(false);
    expect(validatePreset({ ...validPreset, "@type": "Other" })).toBe(false);
    expect(validateFile(file([{ id: "not a UUID" }]))).toBe(false);
  });

  it.each([
    ["without a schema", { "@type": BRUSH_PRESET_COLLECTION_TYPE, items: [] }],
    ["of another type", { ...file([]), "@type": "Other" }],
    ["without presets", { ...file([]), items: undefined }],
    [
      "with too many presets",
      file(Array(MAX_PRESETS_PER_FILE + 1).fill(validPreset)),
    ],
    ["with extra properties", { ...file([]), extra: true }],
    ["that isn't an object", []],
  ])("should reject a file %s", (_label, input) => {
    expect(validateFile(JSON.parse(JSON.stringify(input)))).toBe(false);
  });
});

describe("isValidBrushPreset", () => {
  it("should accept a full preset, and one with only an ID", () => {
    expect(isValidBrushPreset(validPreset)).toEqual({
      valid: true,
      value: validPreset,
    });
    expect(isValidBrushPreset({ id: validPreset.id }).valid).toBe(true);
    expect(
      isValidBrushPreset(withChanges({ author: "Someone", hue: 120 })).valid,
    ).toBe(true);
  });

  it.each([
    ["without an ID", { id: undefined }, "must have required property 'id'"],
    [
      "with an unknown setting",
      { colour: "red" },
      "must NOT have additional properties",
    ],
    [
      "with a JPEG shape",
      { image: "data:image/jpeg;base64,AAAA" },
      "/image must match pattern",
    ],
    [
      "with a shape that is too large",
      {
        image: `data:image/png;base64,${"A".repeat(MAX_SHAPE_DATA_URL_LENGTH)}`,
      },
      "/image must NOT have more than",
    ],
    ["with a size over 256", { width: 300 }, "/width must be <= 256"],
    ["with an opacity over 1", { alpha: 2 }, "/alpha must be <= 1"],
    [
      "with an unknown smoothing",
      { smoothingType: 4 },
      "/smoothingType must be equal to one of the allowed values",
    ],
    [
      "with a sample rate under 5",
      { sampleRate: 1 },
      "/sampleRate must be >= 5",
    ],
    [
      "with an invalid variation",
      { widthConfig: { minPressure: 2 } },
      "/widthConfig/minPressure must be <= 1",
    ],
    [
      "with a pixel grid snap that isn't a boolean",
      { snapToPixelGrid: "yes" },
      "/snapToPixelGrid must be boolean",
    ],
    [
      "with an empty name",
      { name: "" },
      "/name must NOT have fewer than 1 characters",
    ],
    [
      "with an author without a name",
      { author: { handle: "a.test" } },
      "/author must have required property 'name'",
    ],
    [
      "with an author's website (now homepage)",
      { author: { name: "Ada", website: "https://a.test" } },
      "/author must NOT have additional properties",
    ],
  ])("should reject a preset %s", (_label, changes, error) => {
    const result = isValidBrushPreset(withChanges(changes));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join("\n")).toContain(error);
  });
});

describe("isValidBrushPreset profile graphs", () => {
  it("should check a setting's profile graph", () => {
    const profile = (points: unknown, profileId: unknown = "overweight") =>
      isValidBrushPreset(
        withChanges({
          widthConfig: { useRandomise: true, profileId, profile: points },
        }),
      ).valid;
    expect(
      profile([
        { x: 0, y: -10, i: "linear" },
        { x: 10, y: 0, i: "linear" },
      ]),
    ).toBe(true);
    expect(profile([{ x: 0, y: -10, i: "linear" }])).toBe(false);
    expect(
      profile([
        { x: 0, y: -10, i: "wavy" },
        { x: 10, y: 0, i: "linear" },
      ]),
    ).toBe(false);
    expect(profile(undefined, "")).toBe(false);
  });

  it("should take a built-in profile graph's ID or a UUID", () => {
    const profileId = (id: string) =>
      isValidBrushPreset(withChanges({ widthConfig: { profileId: id } })).valid;
    expect(profileId("underweight")).toBe(true);
    expect(profileId("2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a")).toBe(true);
    expect(profileId("custom")).toBe(false);
  });
});

describe("formatErrors", () => {
  it("should name where each error is, using / for the whole value", () => {
    expect(
      formatErrors([
        { instancePath: "/id", message: "must match pattern" },
        { instancePath: "" },
      ]),
    ).toEqual(["/id must match pattern", "/ is invalid"]);
    expect(formatErrors(null)).toEqual([]);
  });
});
