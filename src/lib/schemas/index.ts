// Where PaintCanvas's JSON schemas are published, and how their IDs name each schema and its version.
// Imported with extensions, as the validator build script runs this file in Node

/** Where PaintCanvas's JSON schemas are published */
export const SCHEMA_BASE_URL = "https://lvl99.github.io/paintcanvas/schemas/";

/** The JSON Schema dialect PaintCanvas's schemas are written in */
export const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/** Matches a semver version without pre-release or build parts, e.g. `1.0.0` */
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/** Matches a published schema URL, capturing its name and version */
const SCHEMA_URL_PATTERN = /^(.+)-(\d+\.\d+\.\d+)\.json$/;

/** A schema's name and version, read from its URL */
export interface SchemaName {
  /** e.g. `brush-preset` */
  name: string;
  /** e.g. `1.0.0` */
  version: string;
}

/**
 * The URL a schema is published at: its `$id`.
 *
 * @example
 * schemaUrl("brush-preset", "1.0.0"); // "https://lvl99.github.io/paintcanvas/schemas/brush-preset-1.0.0.json"
 */
export const schemaUrl = (name: string, version: string): string =>
  `${SCHEMA_BASE_URL}${name}-${version}.json`;

/**
 * The name and version of a schema from its URL, or undefined if it isn't one of PaintCanvas's published schemas.
 *
 * @example
 * parseSchemaUrl("https://lvl99.github.io/paintcanvas/schemas/brush-preset-1.0.0.json"); // { name: "brush-preset", version: "1.0.0" }
 * parseSchemaUrl("https://example.com/other.json"); // undefined
 */
export const parseSchemaUrl = (url: unknown): SchemaName | undefined => {
  if (typeof url !== "string" || !url.startsWith(SCHEMA_BASE_URL))
    return undefined;
  const match = SCHEMA_URL_PATTERN.exec(url.slice(SCHEMA_BASE_URL.length));
  return match
    ? { name: match[1] as string, version: match[2] as string }
    : undefined;
};

/**
 * Compare two `major.minor.patch` versions: negative when `a` is older, positive when newer, 0 when the same. Versions
 * that can't be read sort first.
 *
 * @example
 * compareVersions("1.2.0", "1.10.0"); // negative
 */
export const compareVersions = (a: string, b: string): number => {
  const parts = (version: string) =>
    (VERSION_PATTERN.exec(version)?.slice(1) ?? ["-1", "0", "0"]).map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const difference = (x[i] as number) - (y[i] as number);
    if (difference !== 0) return difference;
  }
  return 0;
};

/**
 * The major part of a `major.minor.patch` version. Files whose schema has the same major version as the app's are
 * read without migrating (later minor versions only add optional properties).
 *
 * @example
 * majorVersion("1.2.3"); // 1
 */
export const majorVersion = (version: string): number =>
  Number(VERSION_PATTERN.exec(version)?.[1] ?? NaN);
