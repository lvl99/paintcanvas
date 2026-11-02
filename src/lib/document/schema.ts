// The saved-drawing format: a drawing's size, layers and drawings from elsewhere, with PNG images.
// Imported with extensions, as the validator build script runs this file in Node

/** The `format` of a PaintCanvas document */
export const DOCUMENT_FORMAT = "paintcanvas-document";

/** Version of the document format */
export const DOCUMENT_VERSION = 1;

/** Largest canvas width or height a document may have */
export const MAX_DOCUMENT_SIZE = 10000;

/** Most layers in a document (a canvas may allow fewer, see `maxLayers`) */
export const MAX_DOCUMENT_LAYERS = 100;

/** Most drawings from elsewhere in a document */
export const MAX_DOCUMENT_SHEETS = 100;

/** Longest image in a document (characters): a PNG data URL of up to 100 MB */
export const MAX_DOCUMENT_IMAGE_LENGTH =
  Math.ceil((100 * 1024 * 1024) / 3) * 4 + 22;

/** Blend modes a layer may have (see `BlendMode`) */
export const DOCUMENT_BLEND_MODES = [
  "source-over",
  "screen",
  "lighten",
  "multiply",
  "darken",
  "overlay",
] as const;

/** A layer in a document */
export interface DocumentLayer {
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: (typeof DOCUMENT_BLEND_MODES)[number];
  alphaLock: boolean;
  /** The layer's pixels as a PNG data URL, the size of the canvas */
  image: string;
}

/** A drawing from elsewhere in a document (see `ExternalSheets`) */
export interface DocumentSheet {
  /** Where it came from */
  source: string;
  /** Its pixels as a PNG data URL, the size of the canvas */
  image: string;
}

/** A saved drawing */
export interface PaintCanvasDocument {
  format: typeof DOCUMENT_FORMAT;
  version: typeof DOCUMENT_VERSION;
  width: number;
  height: number;
  /** The user's layers, top first */
  layers: DocumentLayer[];
  /** Index of the selected layer in `layers` */
  activeLayer: number;
  /** Drawings from elsewhere, top first */
  external: DocumentSheet[];
}

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

/** JSON schema for a document */
export const documentSchema = {
  $id: "paintcanvas/document",
  type: "object",
  additionalProperties: false,
  required: [
    "format",
    "version",
    "width",
    "height",
    "layers",
    "activeLayer",
    "external",
  ],
  properties: {
    format: { const: DOCUMENT_FORMAT },
    version: { const: DOCUMENT_VERSION },
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
          "name",
          "visible",
          "opacity",
          "blendMode",
          "alphaLock",
          "image",
        ],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64, pattern: "\\S" },
          visible: { type: "boolean" },
          opacity: { type: "number", minimum: 0, maximum: 1 },
          blendMode: { enum: DOCUMENT_BLEND_MODES },
          alphaLock: { type: "boolean" },
          image,
        },
      },
    },
    activeLayer: {
      type: "integer",
      minimum: 0,
      maximum: MAX_DOCUMENT_LAYERS - 1,
    },
    external: {
      type: "array",
      maxItems: MAX_DOCUMENT_SHEETS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "image"],
        properties: {
          source: { type: "string", minLength: 1, maxLength: 2048 },
          image,
        },
      },
    },
  },
} as const;
