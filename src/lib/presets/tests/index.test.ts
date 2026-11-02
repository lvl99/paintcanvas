import { describe, it, expect } from "vitest";
import { Ajv } from "ajv";
import validPreset from "./brushPreset-valid.data.json";
import {
  BRUSH_PRESET_FILE_FORMAT,
  BRUSH_PRESET_FILE_VERSION,
  MAX_PRESETS_PER_FILE,
  MAX_SHAPE_DATA_URL_LENGTH,
  brushPresetFileSchema,
  brushPresetSchema,
  formatErrors,
  isValidBrushPreset,
  isValidBrushPresetFile,
} from "../index";

/** A preset file with the given presets */
const file = (presets: unknown[]) => ({
  format: BRUSH_PRESET_FILE_FORMAT,
  version: BRUSH_PRESET_FILE_VERSION,
  presets,
});

/** The valid preset with changes (undefined removes a property) */
const withChanges = (changes: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries({ ...structuredClone(validPreset), ...changes }).filter(
      ([, value]) => value !== undefined,
    ),
  );

describe("brush preset schemas", () => {
  it("should compile in ajv strict mode and validate presets and files", () => {
    const ajv = new Ajv({ strict: true, schemas: [brushPresetSchema] });
    const validatePreset = ajv.getSchema(brushPresetSchema.$id)!;
    const validateFile = ajv.compile(brushPresetFileSchema);
    expect(validatePreset(validPreset)).toBe(true);
    expect(validateFile(file([validPreset]))).toBe(true);
    expect(validatePreset({ id: "not a UUID" })).toBe(false);
    expect(validateFile(file([{ id: "not a UUID" }]))).toBe(false);
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
  ])("should reject a preset %s", (_label, changes, error) => {
    const result = isValidBrushPreset(withChanges(changes));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join("\n")).toContain(error);
  });
});

describe("isValidBrushPresetFile", () => {
  it("should accept a file of presets", () => {
    const input = file([validPreset]);
    expect(isValidBrushPresetFile(input)).toEqual({
      valid: true,
      value: input,
    });
    expect(isValidBrushPresetFile(file([])).valid).toBe(true);
    // Any format name is valid here; reading a file checks it is one the app accepts (see `parsePresetFile`)
    expect(
      isValidBrushPresetFile({
        ...file([]),
        format: "otherapp-brush-presets",
      }).valid,
    ).toBe(true);
  });

  it.each([
    ["without a format name", { ...file([]), format: "" }],
    [
      "with a format name that's too long",
      { ...file([]), format: "x".repeat(101) },
    ],
    ["of another version", { ...file([]), version: 2 }],
    ["without presets", { format: BRUSH_PRESET_FILE_FORMAT, version: 1 }],
    ["with an invalid preset", file([{ id: "x" }])],
    [
      "with too many presets",
      file(Array(MAX_PRESETS_PER_FILE + 1).fill(validPreset)),
    ],
    ["with extra properties", { ...file([]), extra: true }],
    ["that isn't an object", []],
  ])("should reject a file %s", (_label, input) => {
    expect(isValidBrushPresetFile(input).valid).toBe(false);
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
