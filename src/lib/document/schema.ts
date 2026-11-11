// Documents: the artworks users make, with their details (name, authors, dates), size, layers, drawings from elsewhere
// and a thumbnail. In the app and in stores, images are PNG blobs (`DrawingDocument`); in files they're PNG data URLs
// (`DocumentFile`, matching `documentSchema`).
// Imported with extensions, as the validator build script runs this file in Node
import {
  UUID_PATTERN,
  authorDetailsSchema,
  fileSchemaUrlSchema,
  type AssetAuthorDetails,
} from "../assets/schema.ts";
import { SCHEMA_DIALECT, schemaUrl } from "../schemas/index.ts";

/** Version of the document schema */
export const DOCUMENT_SCHEMA_VERSION = "1.0.0";

/** `@type` of a document */
export const DOCUMENT_TYPE = "PaintCanvas/Document";

/** Largest canvas width or height a document may have */
export const MAX_DOCUMENT_SIZE = 10000;

/** Most layers in a document (a canvas may allow fewer, see `maxLayers`) */
export const MAX_DOCUMENT_LAYERS = 100;

/** Most drawings from elsewhere in a document */
export const MAX_DOCUMENT_SHEETS = 100;

/** Most authors of a document */
export const MAX_DOCUMENT_AUTHORS = 100;

/** Longest document or layer name (characters) */
export const MAX_DOCUMENT_NAME_LENGTH = 100;

/** Longest side of a document's thumbnail (pixels) */
export const THUMBNAIL_SIZE = 200;

/** Longest image in a document file (characters): a PNG data URL of up to 100 MB */
export const MAX_DOCUMENT_IMAGE_LENGTH =
  Math.ceil((100 * 1024 * 1024) / 3) * 4 + 22;

/** Blending modes a layer may have (see `BlendMode`) */
export const DOCUMENT_BLEND_MODES = [
  "source-over",
  "screen",
  "lighten",
  "multiply",
  "darken",
  "overlay",
] as const;

/** A document's details, kept with the drawing */
export interface DocumentInfo {
  /** A UUID */
  id: string;
  name: string;
  /** Who made it: whoever started it, then everyone who saved it since */
  author: AssetAuthorDetails[];
  /** When it was started (ISO 8601 date and time) */
  dateCreated: string;
  /** When it was last opened (ISO 8601 date and time) */
  dateOpened: string;
}

/** A layer in a document, with its pixels as an image (`T`) the size of the canvas */
export interface DocumentLayer<T> {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendingMode: (typeof DOCUMENT_BLEND_MODES)[number];
  alphaLock: boolean;
  content: T;
}

/** A drawing from elsewhere in a document (see `ExternalSheets`), with its pixels as an image (`T`) */
export interface DocumentSheet<T> {
  /** Where it came from */
  source: string;
  content: T;
}

/** A small picture of a document, at most `THUMBNAIL_SIZE` pixels on its longest side */
export interface DocumentThumbnail<T> {
  width: number;
  height: number;
  content: T;
}

/** A document with its images as `T` */
export interface DocumentOf<T> extends DocumentInfo {
  width: number;
  height: number;
  /** The user's layers, top first */
  layers: DocumentLayer<T>[];
  /** ID of the selected layer */
  activeLayer: string;
  /** Drawings from elsewhere, top first */
  external: DocumentSheet<T>[];
  thumbnail?: DocumentThumbnail<T>;
}

/** A document as the app and stores use it: images are PNG blobs */
export type DrawingDocument = DocumentOf<Blob>;

/** A document as a file (JSON): images are PNG data URLs */
export interface DocumentFile extends DocumentOf<string> {
  $schema: string;
  "@type": typeof DOCUMENT_TYPE;
}

/** A PNG data URL */
const image = {
  type: "string",
  pattern: "^data:image/png;base64,[A-Za-z0-9+/]*={0,2}$",
  maxLength: MAX_DOCUMENT_IMAGE_LENGTH,
} as const;

const size = {
  type: "integer",
  minimum: 1,
  maximum: MAX_DOCUMENT_SIZE,
} as const;

const name = {
  type: "string",
  minLength: 1,
  maxLength: MAX_DOCUMENT_NAME_LENGTH,
  pattern: "\\S",
} as const;

/** Matches an ISO 8601 date and time, e.g. `2026-11-11T09:30:00.000Z` */
export const DATE_TIME_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$";

const date = { type: "string", pattern: DATE_TIME_PATTERN } as const;

/** JSON schema for a document file */
export const documentSchema = {
  $schema: SCHEMA_DIALECT,
  $id: schemaUrl("document", DOCUMENT_SCHEMA_VERSION),
  "@type": DOCUMENT_TYPE,
  type: "object",
  additionalProperties: false,
  required: [
    "$schema",
    "@type",
    "id",
    "name",
    "author",
    "dateCreated",
    "dateOpened",
    "width",
    "height",
    "layers",
    "activeLayer",
    "external",
  ],
  properties: {
    $schema: fileSchemaUrlSchema,
    "@type": { const: DOCUMENT_TYPE },
    id: { type: "string", pattern: UUID_PATTERN },
    name,
    author: {
      type: "array",
      maxItems: MAX_DOCUMENT_AUTHORS,
      items: authorDetailsSchema,
    },
    dateCreated: date,
    dateOpened: date,
    width: size,
    height: size,
    layers: {
      type: "array",
      minItems: 1,
      maxItems: MAX_DOCUMENT_LAYERS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "visible",
          "opacity",
          "blendingMode",
          "alphaLock",
          "content",
        ],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 100 },
          name: { ...name, maxLength: 64 },
          visible: { type: "boolean" },
          opacity: { type: "number", minimum: 0, maximum: 1 },
          blendingMode: { enum: DOCUMENT_BLEND_MODES },
          alphaLock: { type: "boolean" },
          content: image,
        },
      },
    },
    activeLayer: { type: "string", minLength: 1, maxLength: 100 },
    external: {
      type: "array",
      maxItems: MAX_DOCUMENT_SHEETS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "content"],
        properties: {
          source: { type: "string", minLength: 1, maxLength: 2048 },
          content: image,
        },
      },
    },
    thumbnail: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height", "content"],
      properties: {
        width: { type: "integer", minimum: 1, maximum: THUMBNAIL_SIZE },
        height: { type: "integer", minimum: 1, maximum: THUMBNAIL_SIZE },
        content: image,
      },
    },
  },
} as const;
