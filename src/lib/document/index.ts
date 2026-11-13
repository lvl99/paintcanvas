import { formatErrors } from "../presets";
import { validateDocument } from "../validation/validators.generated.js";
import { base64ToBytes, bytesToBase64 } from "../image";
import { compareVersions, majorVersion, parseSchemaUrl } from "../schemas";
import { AssetFileError } from "../assets";
import type { AssetAuthor, AssetAuthorDetails } from "../assets/schema";
import {
  DOCUMENT_SCHEMA_VERSION,
  DOCUMENT_TYPE,
  documentSchema,
  type DocumentFile,
  type DocumentInfo,
  type DocumentOf,
  type DrawingDocument,
} from "./schema";

export * from "./schema";

/** The `format` of documents from before versioned schemas */
export const LEGACY_DOCUMENT_FORMAT = "paintcanvas-document";

/** Name of a new document, or one from before documents had names */
export const UNTITLED_DOCUMENT_NAME = "Untitled";

/** Result of checking a document file */
export type DocumentValidationResult =
  { valid: true; value: DocumentFile } | { valid: false; errors: string[] };

/**
 * Check a document file (e.g. read from a file) against `documentSchema`, and that its selected layer exists.
 *
 * @example
 * isValidDocument(JSON.parse(text)).valid; // true
 */
export const isValidDocument = (input: unknown): DocumentValidationResult => {
  if (!validateDocument(input))
    return { valid: false, errors: formatErrors(validateDocument.errors) };
  if (!input.layers.some((layer) => layer.id === input.activeLayer))
    return { valid: false, errors: ["/activeLayer must be one of the layers"] };
  return { valid: true, value: input };
};

/**
 * An author's details: their name alone becomes `{ name }`.
 *
 * @example
 * authorDetails("Ada"); // { name: "Ada" }
 */
export const authorDetails = (author: AssetAuthor): AssetAuthorDetails =>
  typeof author === "string" ? { name: author } : { ...author };

/**
 * Whether two authors are the same person: by DID when both have one, otherwise by handle when both have one,
 * otherwise by name.
 *
 * @example
 * sameAuthor({ name: "Ada", handle: "ada.test" }, { name: "Ada L", handle: "ada.test" }); // true
 */
export const sameAuthor = (
  a: AssetAuthorDetails,
  b: AssetAuthorDetails,
): boolean => {
  if (a.did && b.did) return a.did === b.did;
  if (a.handle && b.handle) return a.handle === b.handle;
  return a.name === b.name;
};

/**
 * A document's authors with another added at the end, unless they're already one of them.
 *
 * @example
 * withAuthor([{ name: "Ada" }], "Ann"); // [{ name: "Ada" }, { name: "Ann" }]
 */
export const withAuthor = (
  authors: readonly AssetAuthorDetails[],
  author: AssetAuthor,
): AssetAuthorDetails[] => {
  const details = authorDetails(author);
  return authors.some((other) => sameAuthor(other, details))
    ? [...authors]
    : [...authors, details];
};

/**
 * Details for a new document: a new ID, a name, an author, and the time now (as when it was made, opened and changed).
 *
 * @example
 * newDocumentInfo("Ada"); // { id: "1b9d…", name: "Untitled", author: [{ name: "Ada" }], dateCreated: "2026-…", updatedAt: "2026-…", … }
 */
export const newDocumentInfo = (
  author?: AssetAuthor,
  name: string = UNTITLED_DOCUMENT_NAME,
  now: Date = new Date(),
): DocumentInfo => ({
  id: crypto.randomUUID(),
  name,
  author: author === undefined ? [] : [authorDetails(author)],
  dateCreated: now.toISOString(),
  dateOpened: now.toISOString(),
  updatedAt: now.toISOString(),
});

/**
 * A PNG blob as a data URL.
 */
const toDataUrl = async (image: Blob): Promise<string> =>
  `data:image/png;base64,${bytesToBase64(new Uint8Array(await image.arrayBuffer()))}`;

/**
 * A PNG data URL as a blob.
 */
const toBlob = (dataUrl: string): Blob =>
  new Blob([base64ToBytes(dataUrl.slice(dataUrl.indexOf(",") + 1))], {
    type: "image/png",
  });

/**
 * A document with each image changed by a function.
 */
const mapImages = async <A, B>(
  document: DocumentOf<A>,
  change: (image: A) => B | Promise<B>,
): Promise<DocumentOf<B>> => {
  const { layers, external, thumbnail, ...rest } = document;
  return {
    ...rest,
    layers: await Promise.all(
      layers.map(async (layer) => ({
        ...layer,
        content: await change(layer.content),
      })),
    ),
    external: await Promise.all(
      external.map(async (sheet) => ({
        ...sheet,
        content: await change(sheet.content),
      })),
    ),
    ...(thumbnail
      ? {
          thumbnail: {
            ...thumbnail,
            content: await change(thumbnail.content),
          },
        }
      : {}),
  };
};

/**
 * A document as a file (JSON), with its images as PNG data URLs.
 *
 * @example
 * JSON.stringify(await documentToFile(await canvas.createDocument()));
 */
export const documentToFile = async (
  document: DrawingDocument,
): Promise<DocumentFile> => ({
  $schema: documentSchema.$id,
  "@type": DOCUMENT_TYPE,
  ...(await mapImages(document, toDataUrl)),
});

/** Whether a value is a plain object */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A document file from before versioned schemas (`format` and `version: 1`) in the current version: its layers get
 * IDs, it gets new details (named `UNTITLED_DOCUMENT_NAME`, opened and made now), and the selected layer is named by ID.
 */
const migrateLegacyDocument = (
  data: Record<string, unknown>,
  now: Date,
): unknown => {
  const layers = Array.isArray(data.layers) ? data.layers : [];
  const ids = layers.map(() => crypto.randomUUID());
  const info = newDocumentInfo(undefined, UNTITLED_DOCUMENT_NAME, now);
  return {
    $schema: documentSchema.$id,
    "@type": DOCUMENT_TYPE,
    ...info,
    width: data.width,
    height: data.height,
    layers: layers.map((layer: Record<string, unknown>, i) => ({
      id: ids[i],
      name: layer?.name,
      visible: layer?.visible,
      opacity: layer?.opacity,
      blendingMode: layer?.blendMode,
      alphaLock: layer?.alphaLock,
      content: layer?.image,
    })),
    activeLayer: ids[data.activeLayer as number] ?? "",
    external: Array.isArray(data.external)
      ? data.external.map((sheet: Record<string, unknown>) => ({
          source: sheet?.source,
          content: sheet?.image,
        }))
      : data.external,
  };
};

/**
 * Read a document file (e.g. parsed from JSON), with its images as PNG blobs. Files from before versioned schemas are
 * migrated. Throws an `AssetFileError`: `invalid` if it isn't a document or doesn't match its schema, `unsupported` if
 * it's a version the app can't read.
 *
 * @example
 * await canvas.openDocument(documentFromFile(JSON.parse(text)));
 */
export const documentFromFile = (
  data: unknown,
  now: Date = new Date(),
): DrawingDocument => {
  if (!isRecord(data)) throw new AssetFileError("invalid");
  let file: unknown = data;
  const named = parseSchemaUrl(data.$schema);
  if (named) {
    if (named.name !== "document") throw new AssetFileError("invalid");
    if (
      majorVersion(named.version) !== majorVersion(DOCUMENT_SCHEMA_VERSION) ||
      compareVersions(named.version, DOCUMENT_SCHEMA_VERSION) > 0
    )
      throw new AssetFileError("unsupported");
  } else if (data.format === LEGACY_DOCUMENT_FORMAT && data.version === 1)
    file = migrateLegacyDocument(data, now);
  else throw new AssetFileError("invalid");
  const result = isValidDocument(file);
  if (!result.valid) throw new AssetFileError("invalid");
  const document: Partial<DocumentFile> = { ...result.value };
  delete document.$schema;
  delete document["@type"];
  const { layers, external, thumbnail, ...rest } =
    document as DocumentOf<string>;
  return {
    ...rest,
    layers: layers.map((layer) => ({
      ...layer,
      content: toBlob(layer.content),
    })),
    external: external.map((sheet) => ({
      ...sheet,
      content: toBlob(sheet.content),
    })),
    ...(thumbnail
      ? { thumbnail: { ...thumbnail, content: toBlob(thumbnail.content) } }
      : {}),
  };
};

/**
 * The name of the file a document is exported to, starting with a prefix (see `PaintCanvasNames.filePrefix`).
 *
 * @example
 * documentFileName("Sunset at sea"); // "paintcanvas-sunset-at-sea.json"
 */
export const documentFileName = (
  name: string,
  prefix = "paintcanvas",
): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${slug || "document"}.json`;
};
