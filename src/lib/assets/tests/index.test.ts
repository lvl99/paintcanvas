import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import AssetFile, {
  AssetFileError,
  authorSchema,
  collectionSchema,
  type AssetCollectionFile,
} from "..";
import { schemaUrl, SCHEMA_DIALECT } from "../../schemas";
import { withoutType } from "../../validation/standalone";
import type { Validator } from "../../validation/validators.generated.js";

/** A test asset */
interface Note {
  id: string;
  text: string;
}

const noteSchema = {
  $schema: SCHEMA_DIALECT,
  $id: schemaUrl("test-note", "2.0.0"),
  type: "object",
  additionalProperties: false,
  required: ["id", "text"],
  properties: { id: { type: "string" }, text: { type: "string" } },
} as const;

const noteCollectionSchema = collectionSchema({
  name: "test-note-collection",
  version: "2.1.0",
  type: "Test/NoteCollection",
  item: noteSchema.$id,
  maxItems: 3,
});

const ajv = new Ajv2020({
  strict: true,
  schemas: [noteSchema, withoutType(noteCollectionSchema)],
});

const validate = ajv.getSchema(
  noteCollectionSchema.$id,
) as unknown as Validator<AssetCollectionFile<Note>>;

/** Notes files: version 1 named their notes `notes`, and files from before versioned schemas were plain arrays */
const noteFile = new AssetFile<Note>({
  schema: "test-note-collection",
  version: "2.1.0",
  type: "Test/NoteCollection",
  validate,
  fileName: "notes",
  legacyVersion: (data) => (Array.isArray(data.list) ? "legacy" : undefined),
  migrations: [
    {
      from: "legacy",
      to: "1.0.0",
      migrate: (data) => ({ notes: data.list }),
    },
    {
      from: "1.0.0",
      to: "2.0.0",
      migrate: (data) => ({ items: data.notes }),
    },
  ],
});

const note = { id: "a", text: "Hello" };

/** A file of a version */
const file = (version: string, changes: Record<string, unknown> = {}) => ({
  $schema: schemaUrl("test-note-collection", version),
  "@type": "Test/NoteCollection",
  items: [note],
  ...changes,
});

/** The reason reading a file fails */
const failure = (read: () => unknown): string | undefined => {
  try {
    read();
  } catch (error) {
    return error instanceof AssetFileError ? error.reason : "other";
  }
  return undefined;
};

describe("collectionSchema", () => {
  it("should describe a collection file of a version", () => {
    expect(noteCollectionSchema).toMatchObject({
      $schema: SCHEMA_DIALECT,
      $id: schemaUrl("test-note-collection", "2.1.0"),
      "@type": "Test/NoteCollection",
    });
    expect(validate(file("2.1.0"))).toBe(true);
    expect(validate(file("2.1.0", { "@type": "Other" }))).toBe(false);
    expect(validate(file("2.1.0", { items: [note, note, note, note] }))).toBe(
      false,
    );
    expect(validate(file("2.1.0", { extra: true }))).toBe(false);
  });
});

describe("authorSchema", () => {
  const validateAuthor = new Ajv2020({ strict: true }).compile(authorSchema);

  it.each([
    ["a name", "Ada"],
    ["a name and handle", { name: "Ada", handle: "ada.example" }],
    [
      "all details",
      {
        did: "did:plc:abc123",
        name: "Ada",
        handle: "ada.example",
        email: "ada@example.com",
        homepage: "https://ada.example",
      },
    ],
  ])("should accept %s", (_label, author) => {
    expect(validateAuthor(author)).toBe(true);
  });

  it.each([
    ["an empty name", ""],
    ["details without a name", { handle: "ada.example" }],
    ["an invalid DID", { name: "Ada", did: "plc:abc" }],
    ["a website (now homepage)", { name: "Ada", website: "https://a.test" }],
  ])("should reject %s", (_label, author) => {
    expect(validateAuthor(author)).toBe(false);
  });
});

describe("AssetFile", () => {
  it("should write a file of the current version that reads back the same", () => {
    const text = noteFile.write([note]);
    expect(JSON.parse(text)).toEqual(file("2.1.0"));
    expect(noteFile.schemaUrl).toBe(schemaUrl("test-note-collection", "2.1.0"));
    expect(noteFile.parse(text)).toEqual([note]);
  });

  it("should read an older minor version of the same major version", () => {
    expect(noteFile.read(file("2.0.0"))).toEqual([note]);
  });

  it("should migrate older versions one after another", () => {
    expect(
      noteFile.read({
        $schema: schemaUrl("test-note-collection", "1.0.0"),
        notes: [note],
      }),
    ).toEqual([note]);
    expect(noteFile.read({ list: [note] })).toEqual([note]);
  });

  it("should tell which version a file is", () => {
    expect(noteFile.versionOf(file("2.0.0"))).toBe("2.0.0");
    expect(noteFile.versionOf({ list: [] })).toBe("legacy");
    expect(
      noteFile.versionOf({ $schema: schemaUrl("other-collection", "1.0.0") }),
    ).toBeUndefined();
    expect(noteFile.versionOf({})).toBeUndefined();
    expect(
      new AssetFile<Note>({
        ...noteFile.config,
        legacyVersion: undefined,
      }).versionOf({
        list: [],
      }),
    ).toBeUndefined();
  });

  it.each([
    ["a newer minor version", file("2.2.0")],
    ["a newer major version", file("3.0.0")],
    ["an older version with no migration", file("0.9.0")],
  ])("should not read %s", (_label, data) => {
    expect(failure(() => noteFile.read(data))).toBe("unsupported");
  });

  it.each([
    ["a value that isn't an object", []],
    ["another kind of file", { $schema: schemaUrl("other", "2.1.0") }],
    ["a file without a schema", {}],
    ["a file that doesn't match its schema", file("2.1.0", { items: [{}] })],
    ["a file with another type", file("2.1.0", { "@type": "Other" })],
  ])("should not read %s", (_label, data) => {
    expect(failure(() => noteFile.read(data))).toBe("invalid");
  });

  it("should not read text that isn't JSON", () => {
    expect(failure(() => noteFile.parse("{"))).toBe("read");
  });

  it("should not write no assets, or ones that don't match the schema", () => {
    expect(failure(() => noteFile.write([]))).toBe("empty");
    expect(
      failure(() => noteFile.write([{ id: "a" } as unknown as Note])),
    ).toBe("invalid");
  });

  it("should name exported files by date, with a prefix", () => {
    const date = new Date(2026, 10, 4);
    expect(noteFile.fileName(date)).toBe("paintcanvas-notes-2026-11-04.json");
    expect(noteFile.fileName(date, "myapp")).toBe(
      "myapp-notes-2026-11-04.json",
    );
    expect(noteFile.fileName()).toMatch(
      /^paintcanvas-notes-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });

  it("should describe its errors", () => {
    expect(new AssetFileError("empty").message).toBe("Asset file error: empty");
  });
});
