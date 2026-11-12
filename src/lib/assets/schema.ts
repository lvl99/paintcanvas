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

/** Longest asset name or group (characters) */
export const MAX_ASSET_TEXT_LENGTH = 100;

/** Longest asset version (characters) */
export const MAX_ASSET_VERSION_LENGTH = 20;

/** The author of the assets that come with PaintCanvas */
export const BUILT_IN_AUTHOR = "PaintCanvas";

/** The author name of assets whose author isn't known, and of assets made by a user with no name or handle */
export const UNKNOWN_AUTHOR = "Unknown";

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

/**
 * An asset (a brush preset, colour palette or profile graph): a header that describes it, and its `content`.
 *
 * @example
 * const palette: Asset<ColourPaletteConfig> = {
 *   "@type": "PaintCanvas/ColourPalette",
 *   id: crypto.randomUUID(),
 *   name: "Sunset",
 *   author: { name: "Ada", handle: "ada.example" },
 *   content: { colours: ["#ff7e07", "#f40f95"] },
 * };
 */
export interface Asset<T> {
  /** The kind of asset, e.g. `PaintCanvas/BrushPreset` */
  "@type": string;
  /** A UUID for the user's own assets; a readable ID for built-in ones */
  id: string;
  /** Its name */
  name: string;
  /** Who made it */
  author: AssetAuthor;
  /** The family it belongs to (assets of the same group are listed together, e.g. "Round") */
  group?: string;
  /** The asset's own version (not its schema's), e.g. `1.1.0` */
  version?: string;
  /** What the asset holds, e.g. a brush preset's brush settings */
  content: T;
}

/** The properties of an asset's header, which every kind of asset has */
export const ASSET_HEADER_KEYS = [
  "@type",
  "id",
  "name",
  "author",
  "group",
  "version",
] as const;

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

/** Schema of an asset's name or group: text that isn't only spaces */
export const assetTextSchema = {
  type: "string",
  minLength: 1,
  maxLength: MAX_ASSET_TEXT_LENGTH,
  pattern: "\\S",
} as const;

/** Schema of the `$schema` a file names (any version: the app checks which ones it reads) */
export const fileSchemaUrlSchema = {
  type: "string",
  minLength: 1,
  maxLength: MAX_URL_LENGTH,
} as const;

/** Schema of the optional parts of an asset's header, each checked on its own when sanitising (not published) */
export const assetHeaderSchema = {
  $id: "paintcanvas/asset-header",
  type: "object",
  properties: {
    author: authorSchema,
    group: assetTextSchema,
    version: {
      type: "string",
      minLength: 1,
      maxLength: MAX_ASSET_VERSION_LENGTH,
    },
  },
} as const;

/** What an asset's schema is made from */
export interface AssetSchemaOptions<C extends object, I extends object> {
  /** The schema's name, e.g. `brush-preset` */
  name: string;
  /** The schema's version */
  version: string;
  /** The asset's `@type` */
  type: string;
  /** Schema of its ID */
  id: I;
  /** Schema of its content */
  content: C;
}

/**
 * The schema of an asset of one kind: its header (see `Asset`) and its content.
 *
 * @example
 * assetSchema({ name: "colour-palette", version: "2.0.0", type: "PaintCanvas/ColourPalette",
 *   id: { type: "string", pattern: UUID_PATTERN }, content: paletteContentSchema });
 */
export const assetSchema = <C extends object, I extends object>({
  name,
  version,
  type,
  id,
  content,
}: AssetSchemaOptions<C, I>) =>
  ({
    $schema: SCHEMA_DIALECT,
    $id: schemaUrl(name, version),
    "@type": type,
    type: "object",
    additionalProperties: false,
    required: ["@type", "id", "name", "author", "content"],
    properties: {
      // Named when the asset is a file of its own
      $schema: fileSchemaUrlSchema,
      "@type": { const: type },
      id,
      name: assetTextSchema,
      author: assetHeaderSchema.properties.author,
      group: assetHeaderSchema.properties.group,
      version: assetHeaderSchema.properties.version,
      content,
    },
  }) as const;

/** What an asset of an older version is given when it lacks something an asset needs now */
export interface AssetDefaults {
  /** Its name, when it has none */
  name: string;
  /** Its author, when it has none */
  author: AssetAuthor;
}

/**
 * An asset of version 1, whose header and content were side by side, as an asset of version 2 (see `Asset`). It gets
 * its `@type`, and a name and author from `defaults` if it has none.
 *
 * @example
 * toAsset({ id: "…", name: "Sunset", colours: ["#ff7e07"] }, "PaintCanvas/ColourPalette",
 *   { name: "Untitled palette", author: "Unknown" });
 * // { "@type": "PaintCanvas/ColourPalette", id: "…", name: "Sunset", author: "Unknown", content: { colours: [...] } }
 */
export const toAsset = (
  item: unknown,
  type: string,
  defaults: AssetDefaults,
): unknown => {
  if (typeof item !== "object" || item === null || Array.isArray(item))
    return item;
  const header: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item))
    if ((ASSET_HEADER_KEYS as readonly string[]).includes(key))
      header[key] = value;
    else if (key !== "$schema") content[key] = value;
  const { name, author } = header;
  return {
    ...header,
    "@type": type,
    name: typeof name === "string" && name.trim() !== "" ? name : defaults.name,
    author: author ?? defaults.author,
    content,
  };
};

/**
 * An asset, as an asset of version 2: one of version 1 (with no `content`) is turned into one (see `toAsset`), and
 * anything else is left as it is. For assets loaded from stores and settings saved by older versions.
 *
 * @example
 * upgradeAsset({ id: "…", name: "Sunset", colours: [] }, "PaintCanvas/ColourPalette", defaults); // { ..., content: { colours: [] } }
 */
export const upgradeAsset = (
  item: unknown,
  type: string,
  defaults: AssetDefaults,
): unknown =>
  typeof item === "object" && item !== null && !("content" in item)
    ? toAsset(item, type, defaults)
    : item;

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
