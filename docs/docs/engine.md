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

## Foreground and background colours

The engine has two colours, read with `canvas.colours` (`canvas.colour` is the foreground colour):

- The brush paints the foreground colour.
- The eraser removes paint. When the layer's alpha lock is on, it paints the background colour onto existing pixels instead, keeping their transparency. Delete and cut (`deleteMasked()`, `cut()`) do the same inside the mask.
- `canvas.fill("foreground")` and `canvas.fill("background")` fill the selected layer with a colour, as one undoable action: only inside the mask when there is one, and only onto existing pixels when alpha lock is on. The keyboard shortcuts are `cmd backspace` and `alt backspace`; `x` swaps the colours.

One of them is selected for configuration (`canvas.selectedColour`, the foreground by default): the colour sample tool sets it, and colour pickers can use it. Change it with `canvas.selectColour("background")`, and swap the colours with `canvas.swapColours()`.

## Colour palette

`canvas.palette` holds the user's saved colours (`DEFAULT_PALETTE` to start with), each once as lowercase `#rrggbb`. Change them with `add`, `merge`, `remove` and `set`; it dispatches `change` when they change. Like the input settings, it is kept in memory: save and restore it yourself, or with the app settings store.

Palettes are exported and imported as JSON files matching `paletteFileSchema` from `@lvl99dotcom/paintcanvas/lib/palette`:

```ts
import {
  exportPaletteFile,
  parsePaletteFile,
  paletteFileName,
} from "@lvl99dotcom/paintcanvas/lib/palette";

const text = exportPaletteFile(canvas.palette.colours); // { "format": "paintcanvas-palette", "version": 1, "colours": [...] }
canvas.palette.merge(parsePaletteFile(text)); // throws a PaletteFileError for files that aren't compatible
```

Set your own file format name with the `names.paletteFileFormat` option, like `names.presetFileFormat` for brush presets.

## Events

The engine dispatches `change` when its own state changes (tool, colours, panels). Its parts dispatch their own `change`: `canvas.layers`, `canvas.brush`, `canvas.selection`, `canvas.history` and `canvas.viewport`.

Useful building blocks:

- Drawing elements: `<pc-canvas>`, `<pc-canvas-map>`, `<pc-toolbar>`, `<pc-colour-pair>` (the foreground and background colours), `<pc-colour-palette>` (the colour palette menu), `<pc-tool-settings>`, `<pc-brush-menu>`, `<pc-brush-config>`, `<pc-layers-menu>`, `<pc-layer-item>`, `<pc-input-settings>`, `<pc-stats>` (the canvas size, how much the drawing takes in the browser, zoom and the colour under the pointer), `<pc-theme-picker>`.
- Base elements: `<pc-button>`, `<pc-button-group>`, `<pc-icon>`, `<pc-icon-toggle>`, `<pc-toggle-checkbox>`, `<pc-slider>`, `<pc-context-menu>`, `<pc-dialog>`, `<pc-toast>`, `<pc-info-tip>`, `<pc-popover>`, `<pc-panel>`.
- `PcElement`, the base class for your own elements: gives them `t()` for translated text, `iconUrl()` and the design tokens.

Custom brush presets are kept in memory unless you pass a `presetStore` (e.g. backed by IndexedDB) in the options.
