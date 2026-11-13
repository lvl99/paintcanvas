---
sidebar_position: 9
---

# Schemas and asset files

PaintCanvas describes its assets with JSON schemas (draft 2020-12), published at `https://lvl99.github.io/paintcanvas/schemas/`. Each schema's `$id` is its URL and names its version, e.g. `brush-preset-2.1.0.json`. Its `@type` names the kind of thing it describes.

| Schema                                 | `@type`                               | What it is                                                                                                                 |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `brush-preset-2.1.0.json`              | `PaintCanvas/BrushPreset`             | A brush preset                                                                                                             |
| `brush-preset-collection-2.1.0.json`   | `PaintCanvas/BrushPresetCollection`   | A file of brush presets                                                                                                    |
| `colour-palette-2.1.0.json`            | `PaintCanvas/ColourPalette`           | A named list of colours                                                                                                    |
| `colour-palette-collection-2.1.0.json` | `PaintCanvas/ColourPaletteCollection` | A file of colour palettes                                                                                                  |
| `profile-graph-2.1.0.json`             | `PaintCanvas/ProfileGraph`            | A profile graph                                                                                                            |
| `profile-graph-collection-2.1.0.json`  | `PaintCanvas/ProfileGraphCollection`  | A file of profile graphs                                                                                                   |
| `document-1.1.0.json`                  | `PaintCanvas/Document`                | A drawing (see [Saving and opening drawings](./documents.md))                                                              |
| `app-settings-2.1.0.json`              | `PaintCanvas/AppSettings`             | A file of app settings, with the user's assets (see [Keeping the user's settings](./layout.md#keeping-the-users-settings)) |

## Assets

Every asset (an `Asset<T>` from `@lvl99dotcom/paintcanvas/lib/assets`) has a header that describes it, and its `content`:

- `@type`: the kind of asset, e.g. `PaintCanvas/BrushPreset`.
- `id`: a UUID for the user's own; built-in assets keep readable IDs, e.g. the `overweight` profile graph.
- `name`.
- `author`: a name, or `{ did, name, handle, email, homepage }`.
- `group` (optional): the family it belongs to, e.g. "Round".
- `version` (optional): the asset's own version, e.g. `1.1.0`, not its schema's.
- `updatedAt` (optional): when the user last made or changed it (ISO 8601). Making a preset (`canvas.newPreset`), making, renaming or changing a palette's colours, and saving or renaming a profile graph set it; loading, importing, merging and upgrading keep what it was.
- `content`: a brush preset's brush settings (`BrushConfig`), a palette's colours (`{ colours }`, a `ColourPaletteConfig`) or a profile graph's points (`{ points }`, a `ProfileGraphConfig`).

```json
{
  "@type": "PaintCanvas/ColourPalette",
  "id": "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
  "name": "Sunset",
  "author": { "name": "Ada", "handle": "ada.example" },
  "content": { "colours": ["#ff7700", "#ff3355"] }
}
```

In the app, these are the `BrushPreset`, `ColourPalette` and `ProfileGraph` types. The brush engine only uses a preset's content: `canvas.brush.preset` is the current brush settings, and `canvas.brush.name` their name.

## Asset files

Users export and import assets in collection files:

```json
{
  "$schema": "https://lvl99.github.io/paintcanvas/schemas/brush-preset-collection-2.1.0.json",
  "@type": "PaintCanvas/BrushPresetCollection",
  "items": [
    {
      "@type": "PaintCanvas/BrushPreset",
      "id": "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
      "name": "My brush",
      "author": "Ada",
      "content": { "width": 20, "spacing": 2 }
    }
  ]
}
```

`brushPresetFile` (`@lvl99dotcom/paintcanvas/lib/brushes/presetFile`), `colourPaletteFile` (`@lvl99dotcom/paintcanvas/lib/palette`) and `profileGraphFile` (`@lvl99dotcom/paintcanvas/lib/profiles/profileFile`) read and write them. Each is an `AssetFile` (`@lvl99dotcom/paintcanvas/lib/assets`):

```ts
import { brushPresetFile } from "@lvl99dotcom/paintcanvas/lib/brushes/presetFile";
import { AssetFileError } from "@lvl99dotcom/paintcanvas/lib/assets";

const json = brushPresetFile.write(canvas.customPresets.presets);
try {
  // Assets in older files without an author are given the user as theirs
  await canvas.customPresets.save(
    ...brushPresetFile.parse(json, { author: canvas.author }),
  );
} catch (error) {
  if (error instanceof AssetFileError) console.log(error.reason); // "read", "invalid", "unsupported" or "empty"
}
```

## Versions

A schema's version is separate from PaintCanvas's version:

- Adding optional properties is a minor version (e.g. `1.1.0`). Files of an older minor version of the same major version are read as they are.
- Removing or renaming properties, or changing their meaning, is a major version (e.g. `2.0.0`). Files of older major versions are migrated: an `AssetFile`'s `migrations` turn a file into the next version, one after another.
- Files of a newer version than the app knows are refused, as `unsupported`.

Brush preset and colour palette files from before versioned schemas (`format` and `version: 1`) are migrated too.

### When things were changed (`updatedAt`)

Version 2.1.0 of the asset, collection and app settings schemas, and version 1.1.0 of the document schema, add an optional `updatedAt`: when the user last changed the asset, settings or drawing. Apps that keep copies in more than one place (e.g. the browser and the user's account online) can keep the one changed last. Opening or loading something never changes it.

### Version 2.0.0

The asset and collection schemas, and the app settings schema, moved to 2.0.0 when each asset's settings moved into its `content`. Brush presets' `@type` changed from `PaintCanvas/BrushConfig` to `PaintCanvas/BrushPreset` (and their collection's to `PaintCanvas/BrushPresetCollection`). `@type`, `name` and `author` are now required.

Assets of version 1 are upgraded when they're read: from files, from settings files, and from the stores and settings kept in the browser (which are saved again, upgraded). An asset without a name is called "Untitled brush", "Untitled palette" or "Untitled graph", and one without an author is given the user (`canvas.author`), or "Unknown". `upgradeAsset` (`@lvl99dotcom/paintcanvas/lib/assets`) upgrades one asset, and `upgradeSettings` (`@lvl99dotcom/paintcanvas/lib/settings`) the assets in app settings.

Published schema versions never change. After changing a schema, give it a new version and run `pnpm build:schemas`, which writes the new file into `schemas/` (a test fails if a published version's file would change). `pnpm pages:build` publishes them.
