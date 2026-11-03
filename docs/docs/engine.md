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
canvas.setColour("#ff0000");
canvas.addEventListener("change", () => render(canvas));
document.querySelector("#undo").addEventListener("click", () => canvas.undo());
```

The engine dispatches `change` when its own state changes (tool, colour, panels). Its parts dispatch their own `change`: `canvas.layers`, `canvas.brush`, `canvas.selection`, `canvas.history` and `canvas.viewport`.

Useful building blocks:

- Drawing elements: `<pc-canvas>`, `<pc-canvas-map>`, `<pc-toolbar>`, `<pc-tool-settings>`, `<pc-brush-menu>`, `<pc-brush-config>`, `<pc-layers-menu>`, `<pc-layer-item>`, `<pc-input-settings>`, `<pc-stats>` (the canvas size, how much the drawing takes in the browser, zoom and the colour under the pointer), `<pc-theme-picker>`.
- Base elements: `<pc-button>`, `<pc-button-group>`, `<pc-icon>`, `<pc-icon-toggle>`, `<pc-toggle-checkbox>`, `<pc-slider>`, `<pc-context-menu>`, `<pc-dialog>`, `<pc-toast>`, `<pc-info-tip>`, `<pc-popover>`, `<pc-panel>`.
- `PcElement`, the base class for your own elements: gives them `t()` for translated text, `iconUrl()` and the design tokens.

Custom brush presets are kept in memory unless you pass a `presetStore` (e.g. backed by IndexedDB) in the options.
