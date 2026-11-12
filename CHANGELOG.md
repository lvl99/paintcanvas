# Changelog

PaintCanvas follows [semantic versioning](https://semver.org).

## 0.8.0 (2026-11-12)

Versioned, published schemas for every file, a store of its own for each kind of the user's data, named colour palettes, documents with details and thumbnails, saving to remote stores, and settings that wrapper apps can add to.

### Fixed

- Custom brush presets survive reloading the page: `<paint-canvas settings-store>` now keeps them (it gave the canvas no store for them, so they were kept in memory only).

### Added

- JSON schemas (draft 2020-12) published at `https://lvl99.github.io/paintcanvas/schemas/`, each with a versioned `$id` and an `@type`: brush presets, colour palettes and profile graphs (each with a collection file), documents and app settings. `pnpm build:schemas` writes new versions into `schemas/`, and published versions never change.
- `AssetFile` (`lib/assets`) reads, writes and migrates asset collection files (`brushPresetFile`, `colourPaletteFile`, `profileGraphFile`). Files of older versions are migrated, and newer ones are refused with "Unsupported … file version". Files from before versioned schemas still import.
- Asset stores: `AssetStoreLike` (`list`, `put`, `remove`), `IndexedDbAssetStore` and `indexedDbStores(name)`. The engine takes a `stores` option and has `useAssetStores()`. `AssetSync` keeps profile graphs and colour palettes in their stores.
- Named colour palettes (`canvas.palettes`, `ColourPalettes`), shown above PaintCanvas's in `<pc-panel-colours>`, with New palette, Rename…, Export and Delete…. Import and Export use the user's palettes.
- Documents with details (`canvas.documentInfo`, `renameDocument`, `newDocument`), authors and a thumbnail of at most 200px (`createDocument`, `openDocument`, `documentToFile`, `documentFromFile`). The browser autosave keeps the details too.
- Remote document stores (`DocumentStoreLike`, `useRemoteDocumentStore`, `RemoteDocumentAutosave`): the whole document is saved every 5 minutes while it changes, or when asked. `<pc-stats>` shows a progress bar while saving. `MemoryDocumentStore` (`testing/documentStore`) is for tests, and the demo uses it with `?remote`.
- Settings extensions (`canvas.settingsExtensions`, `SettingsExtension`): wrapper apps keep, export, import and check settings of their own with PaintCanvas's.
- App settings files hold the user's colour palettes, profile graphs and brush presets.
- `canvas.author`, and `createApp(options)` in `testing/app`.

### Changed

- **Breaking:** brush preset, colour palette, document and settings files use the new versioned formats (`$schema` and `@type`). Older files still import, but older versions can't read the new ones. `exportDocument` and `importDocument` use the new document file.
- **Breaking:** the PaintCanvas palette (`canvas.palette`) is read-only in the UI and isn't saved with the settings. Colours older versions saved in it move to a "My colours" palette (`keepOlderPalette`).
- **Breaking:** removed `PresetStoreLike`, the `presetStore` and `ownerId` options, `DEFAULT_OWNER_ID`, `PaintCanvasNames.presetFileFormat`, `paletteFileFormat` and `settingsFileFormat`, and the old file functions and constants (`exportPresetFile`, `parsePresetFile`, `exportPaletteFile`, `parsePaletteFile`, `PRESET_FILE_ERRORS`, `SETTINGS_FILE_ERRORS`, `SettingsFileError`, `settingsFileSchema` and the like).
- **Breaking:** `applySettings` is async. An author's `website` is now `homepage`. Profile graph IDs must be UUIDs or a built-in graph's ID.
- **Breaking:** the IndexedDB database is at version 3, with brushes, palettes and profiles stores. Assets kept in stores of their own are left out of the saved settings, and profile graphs in older saved settings move to their store.
- In the brush panel, "Create" is "New brush", on its own row above Import and Export.

## 0.7.0 (2026-11-10)

A setting to draw with the GPU, switches for every checkbox, clearer layer rows, a version line, and a button row that becomes a menu in narrow windows.

### Fixed

- `<pc-slider-range>`'s rail covers the same area as a fill across the whole range; it reached half a handle past each end.

### Added

- "Draw with the GPU" in `<pc-app-settings>`: the user's choice (`ui.rendering`, `cpu` by default or `gpu`) is kept and exported with the app settings and applies after reloading the page, which the panel says. The engine takes `rendering` (`canvas.rendering`), and `<paint-canvas settings-store>` makes its canvas with the user's last choice, kept in `localStorage` (`loadRenderingChoice`, `saveRenderingChoice`).
- `<pc-toggle-checkbox size="s">`: a 16px-high switch. Both sizes are pressable over at least 24px of height.
- "Rename…" in a layer's actions menu, which asks for the new name in a dialog.
- `<pc-version>`: "PaintCanvas v<version> (<commit>)", linked to the GitHub repository; also `versionText()`, `PAINTCANVAS_VERSION` and `PAINTCANVAS_COMMIT` (`lib/version`). The commit is put in when PaintCanvas is built.
- `<pc-button-menu>`: a row of pill buttons for actions that becomes one ⋮ menu while `menu` is set or the window is narrower than `menu-below` (`isNarrowerThan`).

### Changed

- **Breaking:** the layout's default side modes are `"docked, floating@600"`: below 600px wide, panes float over the canvas instead of becoming a rail.
- **Breaking:** a layer's name is plain text instead of a field (rename it from its actions menu), and its opacity is a single-value `pc-slider-range` on its own line.
- Pressing anywhere on a layer row selects its layer, and the selected row is purple.
- Every plain checkbox is a `pc-toggle-checkbox` (input settings, "Snap to pixel grid", "Percent", "Show stroke points").
- `<pc-clipboard-tools>` is built on `<pc-button-menu>` and is a ⋮ menu in windows narrower than 900px (`CLIPBOARD_MENU_BELOW`), as well as while `narrow`.
- `<pc-app-settings>`'s buttons are default-size pills, each on its own full-width row.
- `pnpm dev` uses `vite.demo.config.ts`.

## 0.6.0 (2026-11-09)

Smooth drawing on phones, a dialog window for every window and prompt, range sliders, profile graphs for pressure, tilt and randomness, Copy merged, and one set of pill button sizes.

### Fixed

- Drawing on phones no longer lags, freezes or crashes. Reading the colour under the pointer read every whole layer on each pointer move; autosave read every changed layer's pixels to tell what changed; and encoding and copying layers waited on the GPU, for up to 15 seconds on an iPhone. Colour readouts now read only the pixels they need, `pc-stats` reads the colour at most every 100ms and not while drawing, autosave knows what changed from each layer's change count (`LayerStack.pixelVersion`), PNGs are encoded in a background worker (`PngEncoder`), and the engine's canvases keep their pixels in regular memory.
- iOS no longer zooms the page in when a form field is focused: fields have at least 16px text on touch screens (`touchFields`).
- Escape in a window over another (e.g. a name prompt over brush configuration) closes only the top one, and focus goes back to where it was.

### Added

- `<pc-dialog-window>`: a window over the page built on `<dialog>`, centred and never bigger than the screen, with `header-start`, `header-middle`, `header-end`, `body`, `footer-start`, `footer-middle` and `footer-end` slots (only the body scrolls), and `closable`, `shaded`, `dismissible` and `inline` options. It locks page scroll while open and fires `pc-dismiss`.
- `askConfirm` and `askText` show a `pc-dialog` until the user answers; `pc-dialog` can ask for text (`field`).
- `<pc-slider-range>`: a range slider with two handles that can't cross and a number slider at each end, or one value with `single` (and `number-position`).
- Profile graphs (`lib/profiles`): curves with linear and bezier cubic points that shape how pressure, tilt and randomness move a brush setting between its min and max (`applyProfile`, the `profile` and `profileId` of `BrushParamConfig`), with Linear, Overweight and Underweight presets. The user's own graphs are kept with the app settings (`canvas.profiles`, `ProfileGraphs`, the settings file's `profiles` part). `<pc-profile-graph>` edits a graph and `<pc-profile-editor>` is the window around it (New graph, Duplicate…, Rename…, Delete…, Save, Reset).
- "Copy merged" in `<pc-clipboard-tools>` (`copyMerged()`): the masked part of the shown layers, mixed as shown.
- Pill button sizes `pill-s`, `pill`, `pill-l`, `pill-xl` and `pill-xxl`, as classes and as `<pc-button size>` (`PILL_SIZES`, `PILL_SIZE_STYLES`).
- `createMemoryCanvas`, `MAX_PIXEL_RATIO`, and a profile graph icon.
- The layout guide shows how to hide the layout and show a loading bar until the elements load; the demo does.

### Changed

- **Breaking:** PaintCanvas makes its canvases with `createMemoryCanvas` by default, keeping their pixels in regular memory (pass `createOffscreenCanvas` as `createCanvas` for GPU canvases), and the screen canvas does too. The on-screen canvases use at most 2 device pixels per CSS pixel.
- **Breaking:** brush configuration's pressure, tilt and randomise are radio buttons: a setting varies with one source at a time (`selectSource`), and each has a profile graph button.
- **Breaking:** `pc-dialog` is built on `pc-dialog-window`: Escape and a press outside it choose `cancel` unless it's not `dismissible`. Brush configuration and keyboard shortcuts are `pc-dialog-window`s (brush configuration isn't closed by a press outside it), and brush presets are confirmed and named in dialogs instead of `confirm()` and `prompt()` (`ConfirmFn` and `PromptFn` take options and may return promises).
- The `pill` variant of `<pc-button>` is now the same as `accent`.
- Pill buttons follow the new sizes; those inside panes and panels are `pill-s`.
- Brush configuration uses `pc-slider-range` for every value and range.

## 0.5.0 (2026-11-06)

A narrow layout with the interface over the canvas, number sliders that are dragged or typed, the system clipboard, and a system theme by default.

### Fixed

- Resizing a brush whose proportions are constrained keeps its proportions: it stops when the smaller side reaches 1 or the larger side 256, instead of the sides becoming equal.
- The tool settings bar scrolls sideways when its content is wider than the layout.
- Pasting a shape copied on the canvas into the brush configuration window no longer says it needs PNG data.
- The dark theme's purple meets WCAG 2.2 AA contrast with white text.

### Added

- `<pc-number-slider>`: a number dragged right or up to raise it and left or down to lower it, or tapped to type a value (`step`, `page-step`, `drag-step`, `unit`, `text`). `<pc-brush-size>` is built on it, and the tool settings bar uses it for the brush size, width, height and opacity and the Move tool's width, height and angle.
- A cog button beside the brush size opens a popover with pressure, tilt and focus pen mode above the width, constrain proportions and height. `<pc-popover>` gains `arrow` and `placeBelow()`.
- `<pc-clipboard-tools>`: Cut, Copy and Paste for the brush, eraser, lassos and Move tool (`CLIPBOARD_TOOLS`), at the end of the layout's top pane, and one ⋮ menu while the layout is narrow.
- Copy and cut also put a PNG on the system clipboard (the `systemClipboard` option). Pasting (Cmd/Ctrl + V) pastes images copied in other apps onto the canvas (`pasteImage`). Added `hasClipboard`, `copiedPng()` and `copyCount`.
- The brush configuration window's shape opens the device's own list of built-in shapes (`BUILT_IN_SHAPES`, `builtInShapeId` in `lib/brushes/shapes`); uploaded or pasted shapes show as "Custom". Its Paste button uses the image data copied on the canvas when the clipboard has no PNG.
- "Show stroke points" in the brush testing area draws a stroke's sampled points and stamps, for 3 seconds after it ends.
- An `overlay` side mode: a side's rail or toolbar sits over the canvas, and presses between its buttons reach the canvas (`showsRail`).
- Below `narrow-width` (600px), `<pc-toolbar minimised>` shows its tools as one button that opens a menu of them.
- `pc-menu` items can be non-interactive labels and dividers, and `selected`.
- A press outside an open panel or menu closes it; a press on the canvas that closes one only draws once it moves 4px (`markDismissingPress`, `PointerDrag`, `DRAG_THRESHOLD`).
- The theme and language are kept with the app settings (`canvas.ui`, `UiSettings`, the settings file's `ui` part); `<pc-theme-picker>` (`settings`) and `<pc-input-settings>` (`ui`) restore them.
- `<pc-tool-settings>` has `start` and `end` slots.
- Icons are SVG source artwork with 128×128 `@2x.png` images made by `pnpm icons:build`; new rotate, size arrow and cog icons.
- `--pc-side-button-size`, `--pc-side-icon-size` and `--pc-panel-max-width` design tokens.

### Changed

- **Breaking:** the `auto` theme is now `system`, and it's the default: a page without `data-pc-theme` follows the device.
- **Breaking:** the tool settings bar's brush width, height, constrain proportions, pressure, tilt and focus pen mode are in the size settings popover, and its number fields are `pc-number-slider`s.
- **Breaking:** the kick-out and send-invitation icons are removed, and icon images are named `icon-<name>@2x.png`.
- Every button in the layout's sides is 52 × 52 pixels with 40px icons.
- Panels are at most 290px wide in every layout, and panels opened from a rail are only as tall as their content (at most 90% of the window's height).
- The round and square presets go up to 150px, with Bezier cubic smoothing and a sample rate of 5; round 1px snaps to the pixel grid.

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
