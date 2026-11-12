// Parts shared by the JSON schemas of assets (brush presets, colour palettes and profile graphs) and the collection files
// users export and import them in.
// Imported with extensions, as the validator build script runs this file in Node
import { SCHEMA_DIALECT, schemaUrl } from "../schemas/index.ts";

/** Matches a lowercase UUID */
export const UUID_PATTERN =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

/** Matches a decentralised identifier, e.g. `did:plc:abc123` */
export const DID_PATTERN = "^did:[a-z]+:[a-zA-Z0-9._:%-]+$";

/** Longest author name or handle (characters) */
export const MAX_AUTHOR_TEXT_LENGTH = 100;

/** Longest URL in an asset (characters) */
export const MAX_URL_LENGTH = 2048;

/** Who made an asset or document */
export interface AssetAuthorDetails {
  /** Their decentralised identifier, e.g. an ATProto account's `did:plc:…` */
  did?: string;
  /** Their name */
  name: string;
  /** Their handle or username, which tells their assets apart from others with the same name */
  handle?: string;
  /** Their email */
  email?: string;
  /** Their website */
  homepage?: string;
}

/** Who made an asset: their name, or their details */
export type AssetAuthor = string | AssetAuthorDetails;

/** Short text, such as an author's name */
const authorText = {
  type: "string",
  minLength: 1,
  maxLength: MAX_AUTHOR_TEXT_LENGTH,
} as const;

/** Schema of an author's details */
export const authorDetailsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    did: { type: "string", maxLength: MAX_URL_LENGTH, pattern: DID_PATTERN },
    name: authorText,
    handle: authorText,
    email: { type: "string", maxLength: 254 },
    homepage: { type: "string", maxLength: MAX_URL_LENGTH },
  },
} as const;

/** Schema of an asset's author: a name, or their details */
export const authorSchema = {
  anyOf: [authorText, authorDetailsSchema],
} as const;

/** Schema of the `$schema` a file names (any version: the app checks which ones it reads) */
export const fileSchemaUrlSchema = {
  type: "string",
  minLength: 1,
  maxLength: MAX_URL_LENGTH,
} as const;

/** A collection file: what users export and import one or more assets in */
export interface AssetCollectionFile<T> {
  /** URL of the collection's schema, which names its version */
  $schema: string;
  /** The kind of collection, e.g. `PaintCanvas/BrushConfigCollection` */
  "@type": string;
  /** The assets */
  items: T[];
}

/** What a collection schema is made from */
export interface CollectionSchemaOptions {
  /** The collection schema's name, e.g. `brush-preset-collection` */
  name: string;
  /** The collection schema's version */
  version: string;
  /** The collection's `@type` */
  type: string;
  /** `$id` of each item's schema */
  item: string;
  /** Most items in one file */
  maxItems: number;
}

/**
 * The schema of a collection file holding assets of one kind.
 *
 * @example
 * collectionSchema({ name: "brush-preset-collection", version: "1.0.0", type: "PaintCanvas/BrushConfigCollection",
 *   item: brushPresetSchema.$id, maxItems: 1000 });
 */
export const collectionSchema = ({
  name,
  version,
  type,
  item,
  maxItems,
}: CollectionSchemaOptions) => ({
  $schema: SCHEMA_DIALECT,
  $id: schemaUrl(name, version),
  "@type": type,
  type: "object",
  additionalProperties: false,
  required: ["$schema", "@type", "items"],
  properties: {
    $schema: fileSchemaUrlSchema,
    "@type": { const: type },
    items: { type: "array", maxItems, items: { $ref: item } },
  },
});
