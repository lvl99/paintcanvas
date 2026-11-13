import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  COLOUR_PALETTE_COLLECTION_TYPE,
  COLOUR_PALETTE_TYPE,
  DEFAULT_PALETTE,
  LEGACY_PALETTE_NAME,
  MAX_PALETTE_COLOURS,
  MAX_PALETTES_PER_FILE,
  colourPaletteCollectionSchema,
  colourPaletteFile,
  colourPaletteSchema,
  UNTITLED_PALETTE_NAME,
} from "..";
import { AssetFileError, UNKNOWN_AUTHOR, UUID_PATTERN } from "../../assets";
import { withoutType } from "../../validation/standalone";

const palette = {
  "@type": COLOUR_PALETTE_TYPE,
  id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
  name: "Sunset",
  author: { name: "Ada" },
  content: { colours: ["#ff0000", "#00FF00"] },
};

/** A collection file with the given palettes, and other changes */
const file = (items: unknown[], changes: Record<string, unknown> = {}) => ({
  $schema: colourPaletteCollectionSchema.$id,
  "@type": COLOUR_PALETTE_COLLECTION_TYPE,
  items,
  ...changes,
});

describe("colour palette schemas", () => {
  const ajv = new Ajv2020({ strict: true });
  const validatePalette = ajv.compile(withoutType(colourPaletteSchema));
  const validateFile = ajv.compile(withoutType(colourPaletteCollectionSchema));

  it("should be published with versioned URLs and types", () => {
    expect(colourPaletteSchema.$id).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/colour-palette-2.1.0.json",
    );
    expect(colourPaletteSchema["@type"]).toBe("PaintCanvas/ColourPalette");
    expect(colourPaletteCollectionSchema.$id).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/colour-palette-collection-2.1.0.json",
    );
    expect(colourPaletteCollectionSchema["@type"]).toBe(
      "PaintCanvas/ColourPaletteCollection",
    );
  });

  it("should compile in ajv strict mode and validate palettes and files", () => {
    expect(validatePalette(palette)).toBe(true);
    expect(
      validatePalette({ ...palette, $schema: colourPaletteSchema.$id }),
    ).toBe(true);
    expect(
      validatePalette({
        ...palette,
        group: "Warm",
        version: "1.0.0",
        content: { colours: [...DEFAULT_PALETTE] },
      }),
    ).toBe(true);
    expect(validateFile(file([palette]))).toBe(true);
    expect(validateFile(file([]))).toBe(true);
  });

  it.each([
    ["an ID that isn't a UUID", { id: "sunset" }],
    ["an empty name", { name: " " }],
    ["a colour that isn't #rrggbb", { content: { colours: ["#fff"] } }],
    ["a colour that isn't text", { content: { colours: [255] } }],
    [
      "too many colours",
      { content: { colours: Array(MAX_PALETTE_COLOURS + 1).fill("#000000") } },
    ],
    ["no colours", { content: {} }],
    ["other content", { content: { colours: [], extra: true } }],
    ["other properties", { extra: true }],
    ["another type", { "@type": "Other" }],
    ["no type", { "@type": undefined }],
    ["no author", { author: undefined }],
  ])("should reject a palette with %s", (_label, changes) => {
    expect(
      validatePalette(JSON.parse(JSON.stringify({ ...palette, ...changes }))),
    ).toBe(false);
  });

  it.each([
    ["of another type", file([], { "@type": "Other" })],
    [
      "with too many palettes",
      file(Array(MAX_PALETTES_PER_FILE + 1).fill(palette)),
    ],
    ["with an invalid palette", file([{ id: palette.id }])],
    ["with other properties", file([], { extra: true })],
  ])("should reject a file %s", (_label, input) => {
    expect(validateFile(input)).toBe(false);
  });
});

describe("colourPaletteFile", () => {
  it("should write palettes to a file that reads back the same", () => {
    const text = colourPaletteFile.write([palette]);
    expect(JSON.parse(text)).toEqual(file([palette]));
    expect(colourPaletteFile.parse(text)).toEqual([palette]);
    expect(colourPaletteFile.fileName(new Date(2026, 10, 4))).toBe(
      "paintcanvas-colour-palettes-2026-11-04.json",
    );
  });

  it("should read a file from before versioned schemas, of any format, as one palette", () => {
    const [read, ...rest] = colourPaletteFile.parse(
      JSON.stringify({
        format: "myapp-palette",
        version: 1,
        colours: ["#ff0000"],
      }),
    );
    expect(rest).toEqual([]);
    expect(read).toEqual({
      "@type": COLOUR_PALETTE_TYPE,
      id: expect.stringMatching(new RegExp(UUID_PATTERN)),
      name: LEGACY_PALETTE_NAME,
      author: UNKNOWN_AUTHOR,
      content: { colours: ["#ff0000"] },
    });
  });

  it("should read a file of version 1, giving palettes without an author the user", () => {
    const { content, ...header } = palette;
    const items = [
      { ...header, ...content },
      { ...header, name: undefined, author: undefined, ...content },
    ];
    expect(
      colourPaletteFile.read(
        file(JSON.parse(JSON.stringify(items)), {
          $schema:
            "https://lvl99.github.io/paintcanvas/schemas/colour-palette-collection-1.0.0.json",
        }),
        { author: "Bo" },
      ),
    ).toEqual([
      palette,
      { ...palette, name: UNTITLED_PALETTE_NAME, author: "Bo" },
    ]);
  });

  it.each([
    ["isn't JSON", "{", "read"],
    [
      "has an invalid colour",
      JSON.stringify({ format: "x", version: 1, colours: ["red"] }),
      "invalid",
    ],
    ["has no version", JSON.stringify({ format: "x", colours: [] }), "invalid"],
    [
      "is of a newer version",
      JSON.stringify(
        file([], {
          $schema:
            "https://lvl99.github.io/paintcanvas/schemas/colour-palette-collection-3.0.0.json",
        }),
      ),
      "unsupported",
    ],
  ])("should reject a file that %s", (_label, text, reason) => {
    expect(() => colourPaletteFile.parse(text)).toThrow(AssetFileError);
    try {
      colourPaletteFile.parse(text);
    } catch (error) {
      expect((error as AssetFileError).reason).toBe(reason);
    }
  });

  it("should have a default palette", () => {
    expect(DEFAULT_PALETTE).toHaveLength(15);
  });
});
