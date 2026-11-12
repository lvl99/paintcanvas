import type { Validator } from "../validation/validators.generated.js";
import {
  compareVersions,
  majorVersion,
  parseSchemaUrl,
  schemaUrl,
} from "../schemas";
import type { AssetCollectionFile } from "./schema";

export * from "./schema";

/** Why reading or writing an asset file failed */
export type AssetFileErrorReason =
  /** The file couldn't be read, or isn't JSON */
  | "read"
  /** The file isn't this kind of file, or doesn't match its schema */
  | "invalid"
  /** The file is a version the app can't read */
  | "unsupported"
  /** There's nothing to export */
  | "empty";

/** Reading or writing an asset file failed, for a reason the user can be told */
export class AssetFileError extends Error {
  constructor(readonly reason: AssetFileErrorReason) {
    super(`Asset file error: ${reason}`);
  }
}

/** Turns a file of an older version into the next version */
export interface AssetFileMigration {
  /** Version it migrates from: a schema version, or one named by `legacyVersion` */
  from: string;
  /** Version it migrates to */
  to: string;
  /** The file's data in the newer version (its `$schema` and `@type` are set for you) */
  migrate(data: Record<string, unknown>): Record<string, unknown>;
}

/** What an asset file is */
export interface AssetFileConfig<T> {
  /** Name of the collection's schema, e.g. `brush-preset-collection` */
  schema: string;
  /** Version of the collection's schema the app writes */
  version: string;
  /** The collection's `@type`, e.g. `PaintCanvas/BrushConfigCollection` */
  type: string;
  /** Checks a file of the current version */
  validate: Validator<AssetCollectionFile<T>>;
  /** Names exported files, e.g. `brush-presets` makes `paintcanvas-brush-presets-2026-11-11.json` */
  fileName: string;
  /** Migrations from older versions, applied one after another */
  migrations?: readonly AssetFileMigration[];
  /** The version of a file from before versioned schemas (e.g. `legacy-1`), or undefined if it isn't one */
  legacyVersion?: (data: Record<string, unknown>) => string | undefined;
}

/** Whether a value is a plain object */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads and writes the collection files that users export and import assets of one kind in (e.g. brush presets),
 * migrating files of older versions to the current one.
 *
 * @example
 * const presets = brushPresetFile.parse(await file.text()); // throws AssetFileError
 * const json = brushPresetFile.write(presets);
 */
export default class AssetFile<T> {
  constructor(readonly config: AssetFileConfig<T>) {}

  /** URL of the schema of the files this writes */
  get schemaUrl(): string {
    return schemaUrl(this.config.schema, this.config.version);
  }

  /**
   * The version of a file of this kind, or undefined if it isn't one.
   *
   * @example
   * brushPresetFile.versionOf({ $schema: ".../brush-preset-collection-1.0.0.json" }); // "1.0.0"
   */
  versionOf(data: Record<string, unknown>): string | undefined {
    const named = parseSchemaUrl(data.$schema);
    if (named)
      return named.name === this.config.schema ? named.version : undefined;
    return this.config.legacyVersion?.(data);
  }

  /**
   * The assets in a file's data, migrated from an older version if needed. Throws an `AssetFileError` if it isn't
   * this kind of file, isn't valid, or is a version that can't be read.
   */
  read(data: unknown): T[] {
    if (!isRecord(data)) throw new AssetFileError("invalid");
    let version = this.versionOf(data);
    if (version === undefined) throw new AssetFileError("invalid");
    const { migrations = [], type, validate } = this.config;
    // Each migration moves the file on a version, until there are none left to apply
    for (
      let migration = migrations.find((m) => m.from === version);
      migration;
      migration = migrations.find((m) => m.from === version)
    ) {
      data = {
        ...migration.migrate(data as Record<string, unknown>),
        $schema: schemaUrl(this.config.schema, migration.to),
        "@type": type,
      };
      version = migration.to;
    }
    // The same major version and no newer: it only lacks optional properties added since
    if (
      majorVersion(version) !== majorVersion(this.config.version) ||
      compareVersions(version, this.config.version) > 0
    )
      throw new AssetFileError("unsupported");
    if (!validate(data)) throw new AssetFileError("invalid");
    return data.items;
  }

  /**
   * The assets in a file's text. Throws an `AssetFileError` if it isn't JSON, or (see `read`) can't be read.
   *
   * @example
   * brushPresetFile.parse('{ "$schema": "...", "@type": "PaintCanvas/BrushConfigCollection", "items": [] }'); // []
   */
  parse(text: string): T[] {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AssetFileError("read");
    }
    return this.read(data);
  }

  /**
   * Write assets to a file (JSON) of the current version. Throws an `AssetFileError` if there are none, or they don't
   * match the schema.
   *
   * @example
   * brushPresetFile.write([myPreset]); // '{ "$schema": "...", "@type": "PaintCanvas/BrushConfigCollection", "items": [...] }'
   */
  write(items: readonly T[]): string {
    if (items.length === 0) throw new AssetFileError("empty");
    const file = {
      $schema: this.schemaUrl,
      "@type": this.config.type,
      items,
    };
    if (!this.config.validate(file)) throw new AssetFileError("invalid");
    return JSON.stringify(file, null, 2);
  }

  /**
   * The name of a file exported on a day, starting with a prefix (see `PaintCanvasNames.filePrefix`).
   *
   * @example
   * brushPresetFile.fileName(new Date(2026, 10, 11)); // "paintcanvas-brush-presets-2026-11-11.json"
   */
  fileName(date: Date = new Date(), prefix = "paintcanvas"): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${prefix}-${this.config.fileName}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
  }
}
