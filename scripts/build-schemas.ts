// Writes PaintCanvas's published JSON schemas to `schemas/`, one file per schema version, which `pnpm pages:build`
// publishes at https://lvl99.github.io/paintcanvas/schemas/. Run with: pnpm build:schemas
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  brushPresetCollectionSchema,
  brushPresetSchema,
} from "../src/lib/presets/schema.ts";
import {
  colourPaletteCollectionSchema,
  colourPaletteSchema,
} from "../src/lib/palette/schema.ts";
import {
  profileGraphCollectionSchema,
  profileGraphSchema,
} from "../src/lib/profiles/schema.ts";
import { documentSchema } from "../src/lib/document/schema.ts";
import { SCHEMA_BASE_URL } from "../src/lib/schemas/index.ts";

/** Where the schema files are kept */
export const SCHEMAS_PATH = fileURLToPath(
  new URL("../schemas", import.meta.url),
);

/** The schemas PaintCanvas publishes */
export const PUBLISHED_SCHEMAS: readonly { $id: string }[] = [
  brushPresetSchema,
  brushPresetCollectionSchema,
  colourPaletteSchema,
  colourPaletteCollectionSchema,
  profileGraphSchema,
  profileGraphCollectionSchema,
  documentSchema,
];

/**
 * Each published schema's file name and JSON.
 *
 * @example
 * schemaFiles().get("brush-preset-1.0.0.json"); // '{\n  "$schema": ...'
 */
export const schemaFiles = (
  schemas: readonly { $id: string }[] = PUBLISHED_SCHEMAS,
): Map<string, string> =>
  new Map(
    schemas.map((schema) => {
      if (!schema.$id.startsWith(SCHEMA_BASE_URL))
        throw new Error(`${schema.$id} isn't published at ${SCHEMA_BASE_URL}`);
      return [
        schema.$id.slice(SCHEMA_BASE_URL.length),
        `${JSON.stringify(schema, null, 2)}\n`,
      ];
    }),
  );

/**
 * The files whose committed schema differs from the current one of the same version: a published version never
 * changes, so changing a schema needs a new version.
 *
 * @example
 * changedSchemaFiles(); // [] when every schema change bumped its version
 */
export const changedSchemaFiles = (
  files: Map<string, string> = schemaFiles(),
  path: string = SCHEMAS_PATH,
): string[] =>
  [...files].flatMap(([name, json]) =>
    existsSync(`${path}/${name}`) &&
    readFileSync(`${path}/${name}`, "utf8") !== json
      ? [name]
      : [],
  );

/**
 * Write the schema files that aren't written yet, leaving older versions as they are. Throws if a schema changed
 * without a new version.
 *
 * @returns the names of the files written
 */
export const writeSchemaFiles = (
  files: Map<string, string> = schemaFiles(),
  path: string = SCHEMAS_PATH,
): string[] => {
  const changed = changedSchemaFiles(files, path);
  if (changed.length > 0)
    throw new Error(
      `Published schemas can't change; give them a new version: ${changed.join(", ")}`,
    );
  mkdirSync(path, { recursive: true });
  return [...files].flatMap(([name, json]) => {
    if (existsSync(`${path}/${name}`)) return [];
    writeFileSync(`${path}/${name}`, json);
    return [name];
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url))
  for (const name of writeSchemaFiles()) console.log(`Wrote schemas/${name}`);
