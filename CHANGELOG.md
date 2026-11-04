# Changelog

PaintCanvas follows [semantic versioning](https://semver.org).

## 0.4.0 (2026-11-04)

Foreground and background colours, fills, a colour palette, configurable keyboard shortcuts kept with the user's settings, and the UI rebuilt from panes, panels and menus.

### Fixed

- Layer rows stay inside the layers panel when the blend mode or layer name is wide (Safari and Firefox made the blend mode dropdown as wide as its longest option).
- Keyboard shortcuts no longer run inside an open `<dialog>`, so Escape closes it.

### Added

- Foreground and background colours: `colours`, `setColour(colour, slot)`, `selectedColour`, `selectColour` and `swapColours`. The brush paints the foreground colour; the colour sample tool sets the selected colour.
- With alpha lock on, the eraser, Delete and cut paint the background colour onto existing pixels instead of erasing (or doing nothing).
- `fill("foreground" | "background")` fills the selected layer, or only the masked area, as one undoable action.
- Colour palettes: `canvas.palette`, a JSON palette file format with a schema, and export and import (`lib/palette`). `<pc-colour-pair>` shows the colours in the toolbar and opens `<pc-panel-colours>`: hex value, RGB and HSL sliders whose tracks show the colours their values give, saved colours, and import and export.
- Colour functions in `lib/utils/colour`: `isHexColour`, `normaliseHex` and conversions between hex, RGB and HSL.
- Configurable keyboard shortcuts: `canvas.shortcuts`, `SHORTCUT_DEFINITIONS`, and `<pc-shortcut-settings>` to change them. Key presses are matched on any keyboard layout. New shortcuts: brush and eraser opacity (`<`, `>`), invert selection (`shift cmd i`), zoom in, out and to 100% (`cmd +`, `cmd -`, `cmd 0`), layer opacity (1–0), fills (`cmd backspace`, `alt backspace`) and swapping colours (`x`).
- App settings (input settings, shortcuts, palette and colours): `collectSettings`, `applySettings` and a JSON settings file format with a schema (`lib/settings`), kept in IndexedDB with `<paint-canvas settings-store="name">` (`SettingsAutosave`, `IndexedDbSettingsStore`). `<pc-app-settings>` has "Keyboard shortcuts", "Import settings" and "Export settings" buttons.
- `<pc-pane>`: an area with `start`, `middle` and `end` slots that shows its panels docked, in a rail or floating.
- `PcPanel` is the base of all panels, with `header`, `body` and `footer` slots and `--pc-panel-width`.
- `<pc-context-menu>`: a button that opens a `pc-menu`. Menu items can show a checkmark or icon and their keyboard shortcut (e.g. `⌘S`), and long labels wrap.
- The `--pc-delete-cursor` design token.

### Changed

- **Breaking:** `pc-layers-menu`, `pc-brush-menu` and `pc-colour-palette` are now `pc-panel-layers`, `pc-panel-brushes` and `pc-panel-colours`, extending `PcPanel`.
- **Breaking:** the menu list `pc-context-menu` is now `pc-menu`; `pc-context-menu` is now the button that opens one.
- **Breaking:** side content follows the side's rail and floating modes only inside a `<pc-pane>`. The layout's `openPanel`, `togglePanel` and `closePanel` are now `PcPane`'s.
- **Breaking:** `--pc-panel-width` replaces `--pc-layers-menu-width` and `--pc-panel-max-width`.
- The layout's right side shows a pane with the layers by default, the top a pane with the tool settings, and the app menu opens in a `<pc-panel>`. `<pc-toolbar>` is a pane.
- The layer row's actions menu is a `pc-context-menu`.
- Cut, copy and paste are fixed shortcuts with undo and redo; `h` no longer selects the pan tool (hold Space).
- The IndexedDB database moves to version 2 (adding settings), keeping saved drawings.

## 0.3.1 (2026-11-03)

### Fixed

- Elements register the elements they use again: the build removed imports kept only to register them (e.g. `pc-dialog` didn't register `pc-button`), and `@lvl99dotcom/paintcanvas/ui` didn't register the drawing elements, so `<paint-canvas>` on its own didn't work.

## 0.3.0 (2026-11-03)

Other projects can now use PaintCanvas's translations for their own text.

### Fixed

- `translations.addStrings` for a locale that hadn't loaded yet no longer stops PaintCanvas's own strings for that locale from loading.

### Added

- `translations.addLocales(loaders)` adds an app's own locales. A locale's strings from every set load together when it's chosen and are merged in the order they were added, PaintCanvas's first, so an app can add its own text and replace PaintCanvas's. Locales only the app has become available too.
- `languageName(locale)` (`@lvl99dotcom/paintcanvas/lib/i18n`) names a locale in its own language, using `Intl.DisplayNames`.
- The demo translates its own text with `addLocales` (`demo/locales/`).

### Changed

- **Breaking:** every PaintCanvas translation key starts with `paintCanvas.` (e.g. `paintCanvas.tool.brush`). Add the prefix to keys passed to `addStrings` or `t()`. Apps should prefix their own keys too (e.g. `liveCanvas.`).
- `addStrings` adds its strings after any added before, in the same order as `addLocales`.
- Language pickers name languages with `languageName` instead of `language.*` keys, which are removed, and mark each option with its `lang`. The Chinese names are now "中文（简体）" and "中文（繁體）".

## 0.2.0 (2026-11-03)

The first release of PaintCanvas as its own package, `@lvl99dotcom/paintcanvas`, separate from LiveCanvas.

### Fixed

- `import "@lvl99dotcom/paintcanvas/ui"` and the element modules are kept by bundlers: `"sideEffects": false` let them remove the modules that register custom elements, so no elements were defined.
- The package only contains the version from `package.json`, not the whole file.
- "Delete…" in a layer's menu is disabled for the only layer, which couldn't be deleted (it threw an error).
- Disabled items in a layer's menu are faded, so they no longer look like the others.

### Added

- Keeping the drawing in the browser, so it survives reloading the page: `<paint-canvas store="name">`, or `canvas.useLayerStore(new IndexedDbLayerStore("name"))` (`@lvl99dotcom/paintcanvas/lib/storage`) and the `layerStore` option.
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
- Test helpers: `MemoryLayerStore` (`@lvl99dotcom/paintcanvas/testing/layerStore`) and fake Web Locks (`@lvl99dotcom/paintcanvas/testing/locks`).
- Documentation: a Docusaurus site in `docs/`, with guides and API pages generated from the source.

### Changed

- The package is built: ES modules laid out like `src/`, with TypeScript definitions, in `dist/`. Every documented import path (e.g. `@lvl99dotcom/paintcanvas/lib/classes/PaintCanvas`) has its own file.
- The selected tool in the toolbar is purple.
- Icons aren't inverted in the dark theme.
- "Clear…" and "Delete…" in a layer's menu ask first in the app's own dialog, like "Merge down…", instead of the browser's `window.confirm`. Their Dismiss buttons have the dismiss style. `<pc-layer-item>` no longer has a `confirm` property.
- A layer's menu disables moves the layer can't make: up and to the top for the top layer; down, to the bottom and merging down for the bottom layer.
- The mask tools' "Invert selection" and "Deselect" are disabled while there is no mask.
- `<pc-panel>` is at most 290px wide.
- References to LiveCanvas are generic or removed.
