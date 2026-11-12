---
sidebar_position: 3
sidebar_label: Using the engine
---

# Building your own UI on the engine

Use the engine on its own and the drawing elements with it, or none of the UI at all:

```ts
import PaintCanvas from "@lvl99dotcom/paintcanvas/lib/classes/PaintCanvas";
import { Tool } from "@lvl99dotcom/paintcanvas/lib/classes/PaintCanvas";
import "@lvl99dotcom/paintcanvas/ui/elements/PcCanvas";

const canvas = new PaintCanvas({ width: 1000, height: 800 });
document.querySelector("pc-canvas").app = canvas;

canvas.selectTool(Tool.Brush, { fromToolbar: true });
canvas.setColour("#ff0000"); // foreground
canvas.setColour("#ffffff", "background");
canvas.addEventListener("change", () => render(canvas));
document.querySelector("#undo").addEventListener("click", () => canvas.undo());
```

## Drawing on the CPU or the GPU

By default the canvases keep their pixels in regular memory and draw on the CPU (`rendering: "cpu"`), so saving and copying never wait for the GPU (which stalled phones for up to 15 seconds). Pass `rendering: "gpu"` to ask the browser to keep them on the GPU instead; drawing may be quicker on some devices, and the browser can still choose the CPU.

Browsers fix where a canvas draws when it's made, so `canvas.rendering` can't change while the canvas runs. The user's choice for next time is `canvas.ui.data.rendering` (shown by `<pc-app-settings>` as "Draw with the GPU"); pass it when you next make the canvas. `loadRenderingChoice` and `saveRenderingChoice` (`@lvl99dotcom/paintcanvas/lib/storage`) keep it in `localStorage`, which can be read before the canvas is made:

```ts
import {
  loadRenderingChoice,
  saveRenderingChoice,
} from "@lvl99dotcom/paintcanvas/lib/storage";

const canvas = new PaintCanvas({ rendering: loadRenderingChoice("my-app") });
canvas.ui.addEventListener("change", () =>
  saveRenderingChoice("my-app", canvas.ui.data.rendering),
);
```

`<paint-canvas settings-store="…">` does this for the canvas it makes.

## Foreground and background colours

The engine has two colours, read with `canvas.colours` (`canvas.colour` is the foreground colour):

- The brush paints the foreground colour.
- The eraser removes paint. When the layer's alpha lock is on, it paints the background colour onto existing pixels instead, keeping their transparency. Delete and cut (`deleteMasked()`, `cut()`) do the same inside the mask.
- `canvas.fill("foreground")` and `canvas.fill("background")` fill the selected layer with a colour, as one undoable action: only inside the mask when there is one, and only onto existing pixels when alpha lock is on. The keyboard shortcuts are `cmd backspace` and `alt backspace`; `x` swaps the colours.

One of them is selected for configuration (`canvas.selectedColour`, the foreground by default): the colour sample tool sets it, and colour pickers can use it. Change it with `canvas.selectColour("background")`, and swap the colours with `canvas.swapColours()`.

## Colour palettes

`canvas.palette` holds the colours of the palette PaintCanvas comes with (`DEFAULT_PALETTE`), each once as lowercase `#rrggbb`. Its ID is `DEFAULT_PALETTE_ID`. Users can't change it: picking one of its colours sets the selected foreground or background colour, and changing that colour afterwards doesn't change the palette. It isn't saved with the app settings; colours older versions saved in it are moved to a palette of the user's own named "My colours" (`keepOlderPalette` from `@lvl99dotcom/paintcanvas/lib/settings`). An implementer can give it other colours with `set`.

`canvas.palettes` (a `ColourPalettes`) holds the user's own palettes. Each is an asset (see [Schemas and asset files](./schemas.md#assets)) with an ID, a name, an author and its colours (`content.colours`):

```ts
const sunset = canvas.palettes.create("Sunset", ["#ff7700"], canvas.author);
canvas.palettes.addColour(sunset.id, "#ff3355");
canvas.palettes.rename(sunset.id, "Dusk");
canvas.palettes.removeColour(sunset.id, 0);
canvas.palettes.remove(sunset.id);
```

It dispatches `change` when they change. They're kept in the palette store (see [Keeping the user's assets](#keeping-the-users-assets)), or with the app settings without one.

The user's palettes are exported and imported as colour palette files (see [Schemas and asset files](./schemas.md)):

```ts
import { colourPaletteFile } from "@lvl99dotcom/paintcanvas/lib/palette";

const text = colourPaletteFile.write(canvas.palettes.items);
canvas.palettes.merge(colourPaletteFile.parse(text, { author: canvas.author })); // throws an AssetFileError for files it can't read
```

`<pc-panel-colours>` shows the user's palettes above PaintCanvas's, each with its own [+] to save the selected colour (PaintCanvas's has none, and its colours can't be deleted). Each of the user's palettes has a ⋮ menu (Rename…, Export, Delete…), and "New palette" makes one.

## Events

The engine dispatches `change` when its own state changes (tool, colours, panels). Its parts dispatch their own `change`: `canvas.layers`, `canvas.brush`, `canvas.selection`, `canvas.history` and `canvas.viewport`.

Useful building blocks:

- Drawing elements: `<pc-canvas>`, `<pc-canvas-map>`, `<pc-toolbar>`, `<pc-colour-pair>` (the foreground and background colours), `<pc-panel-colours>` (the colour palette menu), `<pc-shortcut-settings>` (changing keyboard shortcuts), `<pc-app-settings>` (the "Draw with the GPU" switch, keyboard shortcuts window and settings import/export), `<pc-clipboard-tools>` (cut, copy, copy merged (the shown layers mixed as shown) and paste, or a ⋮ menu in windows narrower than 900px or while narrow), `<pc-tool-settings>` (the current tool's settings, with `start` and `end` slots; a brush or eraser's pressure, tilt, focus pen mode, width, height and constrain proportions are in a popover from its cog button), `<pc-panel-brushes>`, `<pc-brush-size>` (the brush size, dragged right or up to grow and left or down to shrink, or tapped to type a size), `<pc-profile-graph>` (a profile graph to edit: press the line to add a point, drag or arrow-key points, make them sharp or smooth, remove them), `<pc-profile-editor>` (the profile graph window: presets and saved graphs, New graph, Duplicate…, Rename…, Delete…, Save, Reset), `<pc-brush-config>` (the brush configuration window; pressure, tilt and randomise are one-at-a-time choices per setting, each with a profile graph (see `@lvl99dotcom/paintcanvas/lib/profiles`); pressing its shape picks a built-in shape, `BUILT_IN_SHAPES` from `@lvl99dotcom/paintcanvas/lib/brushes/shapes`, or upload or paste your own), `<pc-panel-layers>`, `<pc-layer-item>` (a layer's row: pressing anywhere on it selects the layer, shown purple; "Rename…" in its actions menu renames it), `<pc-input-settings>`, `<pc-stats>` (the canvas size, how much the drawing takes in the browser, zoom and the colour under the pointer), `<pc-theme-picker>`, `<pc-version>` (PaintCanvas's version and the commit it was built from, linked to its GitHub repository; also `versionText()` from `@lvl99dotcom/paintcanvas/lib/version`).
- Base elements: `<pc-button>`, `<pc-button-group>`, `<pc-icon>`, `<pc-icon-toggle>`, `<pc-toggle-checkbox>` (an on/off switch, used instead of plain checkboxes; `size="s"` for a 16px switch instead of 20px, both pressable over 24px of height), `<pc-slider>`, `<pc-slider-range>` (a range: one track with low and high handles that can't cross, and a number slider for each end; with `single`, one value with its number slider before or after the track, `number-position`), `<pc-number-slider>` (a number dragged right or up to raise it and left or down to lower it, or tapped to type a value), `<pc-menu>`, `<pc-context-menu>`, `<pc-button-menu>` (a row of pill buttons for actions, which becomes one ⋮ menu while `menu` is set or, with `menu-below="900"`, in windows narrower than that), `<pc-dialog-window>` (a window over the page, centred and never bigger than the screen, with header, body and footer slots; only its body scrolls), `<pc-dialog>`, `<pc-toast>`, `<pc-info-tip>`, `<pc-popover>` (a floating box, optionally with an arrow pointing at the button that opens it), `<pc-panel>`, `<pc-pane>`.
- `PcElement`, the base class for your own elements: gives them `t()` for translated text, `iconUrl()` and the design tokens.

## Keeping the user's assets

The user's assets (custom brush presets, colour palettes and profile graphs) are kept in memory unless the canvas is given a store for each kind, with the `stores` option or `canvas.useAssetStores()`:

```ts
import { indexedDbStores } from "@lvl99dotcom/paintcanvas/lib/storage";

const { settings, ...assets } = indexedDbStores("my-app");
const canvas = new PaintCanvas({ stores: assets });
// or later: canvas.useAssetStores(assets);
```

- Brush presets (`canvas.customPresets`) are loaded from their store, leaving out invalid ones, and saved and deleted as they change.
- Assets saved by older versions are upgraded when they're loaded, and saved again (see [Version 2.0.0](./schemas.md#version-200)).
- Profile graphs (`canvas.profiles`) saved in their store are added when it's used, and changes are saved soon after (`canvas.profileSync`, an `AssetSync`, dispatches `error` when that fails).
- Colour palettes (`canvas.palettes`) work like profile graphs (`canvas.paletteSync`).

A store is anything with the `AssetStoreLike` methods: `list()` (the saved assets, in order; they're checked before use), `put(asset)` (save, replacing one with the same `id`) and `remove(id)`. `IndexedDbAssetStore` keeps them in the browser's IndexedDB, under a name. Use your own to keep them elsewhere, e.g. in a user's account.
