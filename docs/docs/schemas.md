---
sidebar_position: 9
---

# Schemas and asset files

PaintCanvas describes its assets with JSON schemas (draft 2020-12), published at `https://lvl99.github.io/paintcanvas/schemas/`. Each schema's `$id` is its URL and names its version, e.g. `brush-preset-1.0.0.json`. Its `@type` names the kind of thing it describes.

| Schema                                 | `@type`                               | What it is                                                                                                                 |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `brush-preset-1.0.0.json`              | `PaintCanvas/BrushConfig`             | A brush preset                                                                                                             |
| `brush-preset-collection-1.0.0.json`   | `PaintCanvas/BrushConfigCollection`   | A file of brush presets                                                                                                    |
| `colour-palette-1.0.0.json`            | `PaintCanvas/ColourPalette`           | A named list of colours                                                                                                    |
| `colour-palette-collection-1.0.0.json` | `PaintCanvas/ColourPaletteCollection` | A file of colour palettes                                                                                                  |
| `profile-graph-1.0.0.json`             | `PaintCanvas/ProfileGraph`            | A profile graph                                                                                                            |
| `profile-graph-collection-1.0.0.json`  | `PaintCanvas/ProfileGraphCollection`  | A file of profile graphs                                                                                                   |
| `document-1.0.0.json`                  | `PaintCanvas/Document`                | A drawing (see [Saving and opening drawings](./documents.md))                                                              |
| `app-settings-1.0.0.json`              | `PaintCanvas/AppSettings`             | A file of app settings, with the user's assets (see [Keeping the user's settings](./layout.md#keeping-the-users-settings)) |

Assets have an `id` (a UUID for the user's own; built-in profile graphs keep their names, e.g. `overweight`) and an optional `author`: a name, or `{ did, name, handle, email, homepage }`.

## Asset files

Users export and import assets in collection files:

```json
{
  "$schema": "https://lvl99.github.io/paintcanvas/schemas/brush-preset-collection-1.0.0.json",
  "@type": "PaintCanvas/BrushConfigCollection",
  "items": [
    { "id": "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a", "name": "My brush" }
  ]
}
```

`brushPresetFile` (`@lvl99dotcom/paintcanvas/lib/brushes/presetFile`), `colourPaletteFile` (`@lvl99dotcom/paintcanvas/lib/palette`) and `profileGraphFile` (`@lvl99dotcom/paintcanvas/lib/profiles/profileFile`) read and write them. Each is an `AssetFile` (`@lvl99dotcom/paintcanvas/lib/assets`):

```ts
import { brushPresetFile } from "@lvl99dotcom/paintcanvas/lib/brushes/presetFile";
import { AssetFileError } from "@lvl99dotcom/paintcanvas/lib/assets";

const json = brushPresetFile.write(canvas.customPresets.presets);
try {
  await canvas.customPresets.save(...brushPresetFile.parse(json));
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

Published schema versions never change. After changing a schema, give it a new version and run `pnpm build:schemas`, which writes the new file into `schemas/` (a test fails if a published version's file would change). `pnpm pages:build` publishes them.
