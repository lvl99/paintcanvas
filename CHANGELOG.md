# Changelog

PaintCanvas follows [semantic versioning](https://semver.org).

## 0.2.0 (2026-11-03)

The first release of PaintCanvas as its own package, separate from LiveCanvas.

### Fixed

- `import "paintcanvas/ui"` and the element modules are kept by bundlers: `"sideEffects": false` let them remove the modules that register custom elements, so no elements were defined.
- The package only contains the version from `package.json`, not the whole file.
- "Delete…" in a layer's menu is disabled for the only layer, which couldn't be deleted (it threw an error).
- Disabled items in a layer's menu are faded, so they no longer look like the others.

### Added

- Keeping the drawing in the browser, so it survives reloading the page: `<paint-canvas store="name">`, or `canvas.useLayerStore(new IndexedDbLayerStore("name"))` (`paintcanvas/lib/storage`) and the `layerStore` option.
  - Each layer's settings and pixels (as a PNG) are kept in IndexedDB, and only layers whose pixels changed are saved again.
  - The canvas size, layers and selected layer are restored. Undo history isn't kept.
  - Only one window draws on a drawing at a time (Web Locks). Others are blocked with "You are already drawing in another window" and a "Draw here instead" button.
  - A saved drawing that can't be restored stops autosaving, so it isn't saved over.
  - `canvas.restoreLayers()` replaces the canvas size and layers with saved ones. `importDocument` uses it too.
- `<pc-stats>`, the layout's default `footer`: the canvas size, how much the drawing takes in the browser, the zoom and the colour under the pointer.
- `<pc-theme-picker>`: Light, Dark and Auto radios that set `data-pc-theme`, with new `sun`, `moon` and `star` icons.
- A `joined` option for `<pc-button-group>`, which joins its buttons into one pill (`--pc-group-radius` gives each its corners).
- A `layers` option for `<pc-toolbar>`. The layout leaves the toolbar's layers button out when a side has a `<pc-layers-menu>`.
- A `variant` for dialog choices, e.g. `dismiss`.
- `--pc-panel-max-width` (290px) and `--pc-layers-menu-width` (290px). In a narrow layout, a layers menu fills the panel opened from the rail.
- A French translation (`fr`).
- Test helpers: `MemoryLayerStore` (`paintcanvas/testing/layerStore`) and fake Web Locks (`paintcanvas/testing/locks`).
- Documentation: a Docusaurus site in `docs/`, with guides and API pages generated from the source.

### Changed

- The package is built: ES modules laid out like `src/`, with TypeScript definitions, in `dist/`. Every documented import path (e.g. `paintcanvas/lib/classes/PaintCanvas`) has its own file.
- The selected tool in the toolbar is purple.
- Icons aren't inverted in the dark theme.
- "Clear…" and "Delete…" in a layer's menu ask first in the app's own dialog, like "Merge down…", instead of the browser's `window.confirm`. Their Dismiss buttons have the dismiss style. `<pc-layer-item>` no longer has a `confirm` property.
- A layer's menu disables moves the layer can't make: up and to the top for the top layer; down, to the bottom and merging down for the bottom layer.
- The mask tools' "Invert selection" and "Deselect" are disabled while there is no mask.
- `<pc-panel>` is at most 290px wide.
- References to LiveCanvas are generic or removed.
