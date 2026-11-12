// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  DOCUMENT_BLEND_MODES,
  LEGACY_DOCUMENT_FORMAT,
  UNTITLED_DOCUMENT_NAME,
  authorDetails,
  documentFileName,
  documentFromFile,
  documentSchema,
  documentToFile,
  isValidDocument,
  newDocumentInfo,
  sameAuthor,
  withAuthor,
  type DocumentFile,
  type DrawingDocument,
} from "..";
import { BlendMode } from "../../classes/Layer";
import { AssetFileError, UUID_PATTERN } from "../../assets";
import { withoutType } from "../../validation/standalone";

/** A tiny PNG's bytes as base64 (not a real image; only its bytes matter here) */
const PNG_BASE64 = "iVBORw0KGgo=";
const PNG = `data:image/png;base64,${PNG_BASE64}`;
const id = "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a";
const date = "2026-11-11T09:30:00.000Z";

const file: DocumentFile = {
  $schema: documentSchema.$id,
  "@type": "PaintCanvas/Document",
  id,
  name: "Sunset",
  author: [{ name: "Ada", handle: "ada.test", did: "did:plc:ada" }],
  dateCreated: date,
  dateOpened: date,
  width: 100,
  height: 50,
  layers: [
    {
      id: "a",
      name: "Sketch",
      visible: true,
      opacity: 0.5,
      blendingMode: "multiply",
      alphaLock: false,
      content: PNG,
    },
  ],
  activeLayer: "a",
  external: [{ source: "ann", content: PNG }],
  thumbnail: { width: 200, height: 100, content: PNG },
};

/** The reason reading a file fails */
const failure = (data: unknown): string | undefined => {
  try {
    documentFromFile(data);
  } catch (error) {
    return (error as AssetFileError).reason;
  }
  return undefined;
};

describe("document schema", () => {
  it("should match the blend modes of the canvas", () => {
    expect([...DOCUMENT_BLEND_MODES]).toEqual(Object.values(BlendMode));
  });

  it("should be published with a versioned URL and type, and compile and validate documents with ajv", () => {
    expect(documentSchema.$id).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/document-1.0.0.json",
    );
    expect(documentSchema["@type"]).toBe("PaintCanvas/Document");
    const ajv = new Ajv2020({ strict: true });
    const validate = ajv.compile(withoutType(documentSchema));
    expect(validate(file)).toBe(true);
    const withoutThumbnail: Partial<DocumentFile> = { ...file };
    delete withoutThumbnail.thumbnail;
    expect(validate(withoutThumbnail)).toBe(true);
    expect(validate({ ...file, width: 0 })).toBe(false);
    expect(validate.errors?.[0]?.instancePath).toBe("/width");
    expect(validate({ ...file, dateCreated: "yesterday" })).toBe(false);
    expect(validate({ ...file, id: "sunset" })).toBe(false);
    expect(
      validate({ ...file, thumbnail: { width: 201, height: 1, content: PNG } }),
    ).toBe(false);
  });
});

describe("isValidDocument", () => {
  it("should accept a valid document", () => {
    expect(isValidDocument(file)).toEqual({ valid: true, value: file });
  });

  it.each([
    ["isn't an object", "document", "/ must be object"],
    [
      "has no layers",
      { ...file, layers: [] },
      "/layers must NOT have fewer than 1 items",
    ],
    [
      "has an image that isn't a PNG",
      {
        ...file,
        external: [{ source: "ann", content: "data:image/gif;base64,R0lGOD" }],
      },
      '/external/0/content must match pattern "^data:image/png;base64,[A-Za-z0-9+/]*={0,2}$"',
    ],
    [
      "selects a layer it doesn't have",
      { ...file, activeLayer: "b" },
      "/activeLayer must be one of the layers",
    ],
  ])("should reject a document that %s", (_label, input, error) => {
    expect(isValidDocument(input)).toEqual({ valid: false, errors: [error] });
  });
});

describe("authors", () => {
  it("should tell authors apart by DID, then handle, then name", () => {
    expect(authorDetails("Ada")).toEqual({ name: "Ada" });
    expect(
      sameAuthor(
        { name: "A", did: "did:plc:1" },
        { name: "A", did: "did:plc:2" },
      ),
    ).toBe(false);
    expect(
      sameAuthor(
        { name: "A", handle: "a.test" },
        { name: "B", handle: "a.test" },
      ),
    ).toBe(true);
    expect(sameAuthor({ name: "A" }, { name: "A", handle: "a.test" })).toBe(
      true,
    );
    expect(sameAuthor({ name: "A" }, { name: "B" })).toBe(false);
  });

  it("should add an author once", () => {
    const authors = [{ name: "Ada" }];
    expect(withAuthor(authors, "Ann")).toEqual([
      { name: "Ada" },
      { name: "Ann" },
    ]);
    expect(withAuthor(authors, { name: "Ada" })).toEqual(authors);
    expect(withAuthor(authors, "Ada")).not.toBe(authors);
  });
});

describe("newDocumentInfo", () => {
  it("should give a new document an ID, a name, its author and the time", () => {
    const now = new Date(date);
    expect(newDocumentInfo("Ada", "Sketch", now)).toEqual({
      id: expect.stringMatching(new RegExp(UUID_PATTERN)),
      name: "Sketch",
      author: [{ name: "Ada" }],
      dateCreated: date,
      dateOpened: date,
    });
    expect(newDocumentInfo()).toMatchObject({
      name: UNTITLED_DOCUMENT_NAME,
      author: [],
    });
  });
});

describe("documentToFile and documentFromFile", () => {
  it("should write a document's images as data URLs, and read them back as PNG blobs", async () => {
    const read = documentFromFile(file);
    expect(read).not.toHaveProperty("$schema");
    expect(read.layers[0]!.content).toBeInstanceOf(Blob);
    expect(read.layers[0]!.content.type).toBe("image/png");
    expect(read.thumbnail?.content).toBeInstanceOf(Blob);
    expect(await documentToFile(read)).toEqual(file);
    const rest: Partial<DrawingDocument> = { ...read };
    delete rest.thumbnail;
    expect(await documentToFile(rest as DrawingDocument)).not.toHaveProperty(
      "thumbnail",
    );
  });

  it("should read a document from before versioned schemas", () => {
    const now = new Date(date);
    const read = documentFromFile(
      {
        format: LEGACY_DOCUMENT_FORMAT,
        version: 1,
        width: 10,
        height: 10,
        layers: [
          {
            name: "Top",
            visible: true,
            opacity: 1,
            blendMode: "screen",
            alphaLock: false,
            image: PNG,
          },
          {
            name: "Bottom",
            visible: false,
            opacity: 0.5,
            blendMode: "source-over",
            alphaLock: true,
            image: PNG,
          },
        ],
        activeLayer: 1,
        external: [{ source: "ann", image: PNG }],
      },
      now,
    );
    expect(read).toMatchObject({
      name: UNTITLED_DOCUMENT_NAME,
      author: [],
      dateCreated: date,
      dateOpened: date,
      layers: [
        { name: "Top", blendingMode: "screen" },
        { name: "Bottom", blendingMode: "source-over", alphaLock: true },
      ],
      external: [{ source: "ann" }],
    });
    expect(read.activeLayer).toBe(read.layers[1]!.id);
    expect(read).not.toHaveProperty("thumbnail");
  });

  it.each([
    ["a value that isn't an object", [], "invalid"],
    [
      "another kind of file",
      {
        $schema:
          "https://lvl99.github.io/paintcanvas/schemas/brush-preset-1.0.0.json",
      },
      "invalid",
    ],
    ["a file without a schema or format", {}, "invalid"],
    [
      "a newer version",
      {
        ...file,
        $schema:
          "https://lvl99.github.io/paintcanvas/schemas/document-2.0.0.json",
      },
      "unsupported",
    ],
    [
      "a newer minor version",
      {
        ...file,
        $schema:
          "https://lvl99.github.io/paintcanvas/schemas/document-1.1.0.json",
      },
      "unsupported",
    ],
    ["an invalid document", { ...file, layers: [] }, "invalid"],
    [
      "an invalid older document",
      {
        format: LEGACY_DOCUMENT_FORMAT,
        version: 1,
        layers: "none",
        external: "none",
      },
      "invalid",
    ],
  ])("should not read %s", (_label, data, reason) => {
    expect(failure(data)).toBe(reason);
  });

  it("should read an older minor version of the same major version", () => {
    expect(
      failure({
        ...file,
        $schema:
          "https://lvl99.github.io/paintcanvas/schemas/document-1.0.0.json",
      }),
    ).toBeUndefined();
  });
});

describe("documentFileName", () => {
  it("should name the file after the document, with a prefix", () => {
    expect(documentFileName("Sunset at sea!")).toBe(
      "paintcanvas-sunset-at-sea.json",
    );
    expect(documentFileName("夕焼け", "myapp")).toBe("myapp-夕焼け.json");
    expect(documentFileName("!!!")).toBe("paintcanvas-document.json");
  });
});
