import { describe, it, expect } from "vitest";
import { Ajv } from "ajv";
import {
  DEFAULT_PALETTE,
  MAX_PALETTE_COLOURS,
  PALETTE_FILE_ERRORS,
  PALETTE_FILE_FORMAT,
  PALETTE_FILE_VERSION,
  PaletteFileError,
  exportPaletteFile,
  isValidPaletteFile,
  paletteFileName,
  paletteFileSchema,
  parsePaletteFile,
} from "..";

/** A palette file with the given colours, and other changes */
const file = (colours: unknown[], changes: Record<string, unknown> = {}) => ({
  format: PALETTE_FILE_FORMAT,
  version: PALETTE_FILE_VERSION,
  colours,
  ...changes,
});

describe("palette file schema", () => {
  it("should compile in ajv strict mode and validate files", () => {
    const validate = new Ajv({ strict: true }).compile(paletteFileSchema);
    expect(validate(file(["#ff0000", "#00FF00"]))).toBe(true);
    expect(validate(file([]))).toBe(true);
    expect(validate(file(["red"]))).toBe(false);
    expect(validate(file(["#ff0000"], { version: 2 }))).toBe(false);
  });
});

describe("isValidPaletteFile", () => {
  it("should accept a valid file", () => {
    const valid = file(["#ff0000", "#ABCDEF"]);
    expect(isValidPaletteFile(valid)).toEqual({ valid: true, value: valid });
  });

  it.each([
    ["a colour that isn't #rrggbb", file(["#fff"]), "/colours/0 must match"],
    ["a colour that isn't a string", file([255]), "/colours/0 must be string"],
    ["no colours", { format: "x", version: 1 }, "required property 'colours'"],
    ["another version", file([], { version: 2 }), "/version must be equal"],
    [
      "an empty format",
      file([], { format: "" }),
      "/format must NOT have fewer",
    ],
    ["other properties", file([], { name: "x" }), "additional properties"],
    [
      "too many colours",
      file(Array.from({ length: MAX_PALETTE_COLOURS + 1 }, () => "#000000")),
      "/colours must NOT have more than",
    ],
  ])("should reject a file with %s", (_, input, error) => {
    const result = isValidPaletteFile(input);
    expect(result.valid).toBe(false);
    expect(!result.valid && result.errors[0]).toContain(error);
  });

  it("should accept the default palette", () => {
    expect(isValidPaletteFile(file([...DEFAULT_PALETTE])).valid).toBe(true);
    expect(DEFAULT_PALETTE).toHaveLength(15);
  });
});

describe("paletteFileName", () => {
  it("should name the file by date, with a prefix", () => {
    const date = new Date(2026, 10, 4);
    expect(paletteFileName(date)).toBe("paintcanvas-palette-2026-11-04.json");
    expect(paletteFileName(date, "myapp")).toBe(
      "myapp-palette-2026-11-04.json",
    );
    expect(paletteFileName()).toMatch(
      /^paintcanvas-palette-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
});

describe("exportPaletteFile and parsePaletteFile", () => {
  it("should write colours that read back the same", () => {
    const text = exportPaletteFile(["#ff0000", "#00ff00"]);
    expect(JSON.parse(text)).toEqual(file(["#ff0000", "#00ff00"]));
    expect(parsePaletteFile(text)).toEqual(["#ff0000", "#00ff00"]);
  });

  it("should write and read the implementer's own format", () => {
    const text = exportPaletteFile(["#ff0000"], "myapp-palette");
    expect(JSON.parse(text).format).toBe("myapp-palette");
    expect(parsePaletteFile(text, ["myapp-palette"])).toEqual(["#ff0000"]);
  });

  it("should read colours as lowercase", () => {
    expect(parsePaletteFile(JSON.stringify(file(["#ABCDEF"])))).toEqual([
      "#abcdef",
    ]);
  });

  it.each([
    ["isn't JSON", "{"],
    ["isn't a palette file", JSON.stringify(file(["red"]))],
    ["has another format", JSON.stringify(file([], { format: "other" }))],
  ])("should throw when the file %s", (_, text) => {
    expect(() => parsePaletteFile(text)).toThrow(PaletteFileError);
    expect(() => parsePaletteFile(text)).toThrow(
      PALETTE_FILE_ERRORS.incompatible,
    );
  });
});
