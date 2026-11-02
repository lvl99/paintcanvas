# PaintCanvas

Open-source painting engine and renderer for the browser, with optional UI.

- **Engine** (`paintcanvas/lib/*`): layers, brushes and erasers, custom brush presets, selection, transforms, clipboard, undo/redo, viewport, pen/touch/mouse input and rendering. No UI and no storage.
- **Messages**: the engine sends and receives small drawing messages (patches of pixels, strokes, undo and redo), so you can share a drawing over any transport you choose.
- **UI** (`paintcanvas/ui`), optional: Lit web components, from buttons and sliders up to a full `<paint-canvas>` layout with slots for your own parts.

Licensed under the [Apache License 2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) to help.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [The layout and its slots](#the-layout-and-its-slots)
- [Building your own UI on the engine](#building-your-own-ui-on-the-engine)
- [Messages and events](#messages-and-events)
- [Saving and opening drawings](#saving-and-opening-drawings)
- [Translations](#translations)
- [Icons](#icons)
- [Theming](#theming)
- [Demo](#demo)
- [Development](#development)

## Installation

```sh
npm install paintcanvas lit
```

[Lit](https://lit.dev) is a peer dependency, used by the UI only.

## Quick start

A full-page drawing app:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html,
      body,
      paint-canvas {
        height: 100%;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <paint-canvas></paint-canvas>
    <script type="module">
      import "paintcanvas/ui";
      import { translations } from "paintcanvas/lib/i18n";

      await translations.useDeviceLocale();
    </script>
  </body>
</html>
```

`<paint-canvas>` creates its own engine (a 2000 × 2000 pixel canvas). To choose the size or other options, give it one:

```ts
import PaintCanvas from "paintcanvas/lib/classes/PaintCanvas";

const layout = document.querySelector("paint-canvas");
layout.app = new PaintCanvas({ width: 1200, height: 800, maxLayers: 10 });
```

Importing `paintcanvas/ui` registers every element. To load less, import single elements, e.g. `paintcanvas/ui/elements/PaintCanvas`.

## The layout and its slots

```
┌──────────────────── header ────────────────────┐
│      │           top (tool settings)   │       │
│ left │                                 │ right │
│(tool-│      center (canvas)            │       │
│ bar) │      + overlay                  │       │
│      │           bottom                │       │
└──────────────────── footer ────────────────────┘
```

| Slot      | Default content                     |
| --------- | ----------------------------------- |
| `header`  | Nothing                             |
| `left`    | `<pc-toolbar>`                      |
| `top`     | `<pc-tool-settings>` for the tool   |
| `center`  | `<pc-canvas>`                       |
| `overlay` | `<pc-canvas-map>`, over the canvas  |
| `bottom`  | Nothing                             |
| `right`   | Nothing                             |
| `footer`  | Nothing                             |
| `menu`    | Opened by the toolbar's menu button |

Put your own element in a slot to replace its default. Empty areas take no space.

```html
<paint-canvas menu-text="App" menu-label="App menu">
  <pc-panel slot="right" icon="layers" label="Layers">
    <pc-layers-menu></pc-layers-menu>
  </pc-panel>
  <nav slot="menu">…</nav>
</paint-canvas>
```

### Side modes

Each side (`left` and `right`) is shown in one of three modes, chosen by the layout's width:

- `docked`: beside the canvas.
- `rail`: a column of buttons, one per `<pc-panel>` in the side. Each button opens its panel over the canvas; Escape or a press outside closes it.
- `floating`: over the canvas as a palette that starts collapsed to a button.

Set the rules with `left-modes` and `right-modes`: a mode, then `mode@width` for layouts narrower than that width. The default is `"docked, rail@600"`.

```html
<paint-canvas right-modes="docked, rail@800, floating@400"></paint-canvas>
```

### Layout state

The layout reflects its state as attributes, so you can style for it:

| Attribute                   | Meaning                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `narrow`                    | Narrower than `narrow-width` (default 600px)               |
| `input="pen\|touch\|mouse"` | The latest kind of press                                   |
| `ui-hidden`                 | The interface is hidden (Tab key), leaving only the canvas |
| `left-mode`, `right-mode`   | Each side's current mode                                   |

It also dispatches `pc-state-change` when the state changes. `<pc-match>` shows its template's contents only while a condition holds; conditions are `narrow`, `ui-hidden`, `input:<kind>`, `left:<mode>` and `right:<mode>`, each negatable with `!`:

```html
<pc-match when="input:touch">
  <template><p>Pinch to zoom.</p></template>
</pc-match>
```

In your own Lit elements, `LayoutStateController` gives the same state.

### Keyboard shortcuts

The layout handles keyboard shortcuts (tools, brush size, undo and redo, selection, clipboard, Tab to hide the interface, Cmd/Ctrl + S to save a PNG). Set `.shortcuts=${false}` to handle them yourself with `KeyboardShortcuts` (`paintcanvas/lib/classes/KeyboardShortcuts`), which dispatches `pc-shortcut` for actions it leaves to you.

## Building your own UI on the engine

Use the engine on its own and the drawing elements with it, or none of the UI at all:

```ts
import PaintCanvas from "paintcanvas/lib/classes/PaintCanvas";
import { Tool } from "paintcanvas/lib/classes/PaintCanvas";
import "paintcanvas/ui/elements/PcCanvas";

const canvas = new PaintCanvas({ width: 1000, height: 800 });
document.querySelector("pc-canvas").app = canvas;

canvas.selectTool(Tool.Brush, { fromToolbar: true });
canvas.setColour("#ff0000");
canvas.addEventListener("change", () => render(canvas));
document.querySelector("#undo").addEventListener("click", () => canvas.undo());
```

The engine dispatches `change` when its own state changes (tool, colour, panels). Its parts dispatch their own `change`: `canvas.layers`, `canvas.brush`, `canvas.selection`, `canvas.history` and `canvas.viewport`.

Useful building blocks:

- Drawing elements: `<pc-canvas>`, `<pc-canvas-map>`, `<pc-toolbar>`, `<pc-tool-settings>`, `<pc-brush-menu>`, `<pc-brush-config>`, `<pc-layers-menu>`, `<pc-layer-item>`, `<pc-input-settings>`.
- Base elements: `<pc-button>`, `<pc-button-group>`, `<pc-icon>`, `<pc-icon-toggle>`, `<pc-toggle-checkbox>`, `<pc-slider>`, `<pc-context-menu>`, `<pc-dialog>`, `<pc-toast>`, `<pc-info-tip>`, `<pc-popover>`, `<pc-panel>`.
- `PcElement`, the base class for your own elements: gives them `t()` for translated text, `iconUrl()` and the design tokens.

Custom brush presets are kept in memory unless you pass a `presetStore` (e.g. backed by IndexedDB) in the options.

## Messages and events

PaintCanvas doesn't decide where drawings go. It sends messages; you carry them.

```ts
// Send: patches of the user's drawing shortly after it changes, plus each stroke if asked
const stop = canvas.onMessage((message) => transport.send(message));
canvas.startSending({ patches: true, strokes: false, delayMs: 200 });

// Receive: draw another source's messages onto their own sheet, under or over the user's layers
transport.onMessage((from, message) => canvas.receive(from, message));
```

| Message  | Holds                                                    |
| -------- | -------------------------------------------------------- |
| `patch`  | A changed area of pixels (PNG or RGBA, deflated, base64) |
| `stroke` | A finished brush or eraser stroke: its points and brush  |
| `undo`   | A step undone                                            |
| `redo`   | A step redone                                            |

Every message has a `protocol` version and a `type`. `receive` checks messages first and ignores invalid ones; `validateCanvasMessage` (`paintcanvas/lib/messages`) checks them yourself.

Other useful methods:

- `canvas.snapshot()`: a patch of the user's whole drawing, e.g. for someone who joins late.
- `canvas.sendNow()`: send what changed straight away.
- `canvas.external`: the sheets drawn from other sources; `clear()` removes them.
- The `history` event: an undo or redo message was received.

## Saving and opening drawings

```ts
const json = JSON.stringify(await canvas.exportDocument());
await canvas.importDocument(JSON.parse(json)); // false if the document isn't valid
```

A document holds the canvas size, the user's layers and drawings from other sources, with PNG images.

## Translations

The UI's text comes from `translations` (`paintcanvas/lib/i18n`). Built-in locales: `en-US` (fallback), `en-GB`, `ja`, `ko`, `zh-Hans` and `zh-Hant`. Locale files load when first used, and the UI switches language without reloading.

```ts
import { translations } from "paintcanvas/lib/i18n";

await translations.useDeviceLocale(); // the best match for the device's languages
await translations.setLocale("ja");
translations.addStrings("en-US", { "layout.tools": "Tools" }); // change or add text
translations.t("presets.deleted", { name: "Sketch" }); // 'Deleted "Sketch"'
```

Strings missing from a locale come from `en-US`. The locale files are in `locales/` (exported as `paintcanvas/locales/*`).

## Icons

Replace any icon, or add your own, with an image URL (e.g. an SVG data URL):

```ts
import { icons } from "paintcanvas/ui";

icons.register({ brush: "/my-icons/brush.svg", chat: "/my-icons/chat.svg" });
```

Elements update when icons change. `DEFAULT_ICONS` lists the names.

## Theming

The look comes from CSS custom properties named `--pc-*` (colours, spacing, fonts, shadows). Override any on `:root` or on an ancestor:

```css
:root {
  --pc-accent: #0a7d55;
  --pc-font: "Inter", sans-serif;
}
```

For the dark theme, set `data-pc-theme="dark"` on an ancestor (or `"auto"` to follow the device), or `theme="dark"` on a single element. `LIGHT_TOKENS` and `DARK_TOKENS` list every token.

## Demo

```sh
pnpm demo
```

- http://localhost:5190/: a full-page PaintCanvas with a layers panel, a menu with input settings and a dark theme switch.
- http://localhost:5190/elements.html: the base elements.

## Development

You need [Node.js](https://nodejs.org) 22.18 or later (scripts run TypeScript directly) and [pnpm](https://pnpm.io) (`corepack enable` installs the version in `package.json`).

```sh
pnpm install
pnpm exec playwright install chromium   # once, for the browser tests
```

Source layout:

- `src/lib/`: engine code (brushes, rendering, selection, transform, classes, messages, document, i18n, image, presets, validation, utils). No UI.
- `src/ui/`: tokens, icons, base elements, drawing elements and the layout.
- `src/testing/`: test helpers (fake and recording canvases), published as `paintcanvas/testing/*`. Some use Vitest.
- `locales/`: UI text per locale.
- `scripts/`: build scripts, e.g. the validator generator.
- `demo/`: the demo pages.

Tests sit in a `tests` folder beside the code. Unit tests (`*.test.ts`) run in jsdom; pixel tests (`*.browser.test.ts`) run in headless Chromium.

| Command                 | Does                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| `pnpm typecheck`        | Checks types in the source, tests, scripts and demo                               |
| `pnpm lint`             | Checks the code with ESLint                                                       |
| `pnpm format`           | Formats files with Prettier (`pnpm format:check` only checks)                     |
| `pnpm test`             | Runs the unit tests                                                               |
| `pnpm test:browser`     | Runs the pixel tests in a real browser                                            |
| `pnpm test:all`         | Runs both                                                                         |
| `pnpm coverage`         | Runs both, with a coverage report in `coverage/`                                  |
| `pnpm build`            | Builds the package into `dist/`: ES modules matching `src/`, with types           |
| `pnpm build:validators` | Regenerates the validators after changing the preset, message or document schemas |
| `pnpm demo`             | Starts the demo                                                                   |

Each folder in `src/lib` and `src/ui` is published as its own import path (e.g. `src/lib/classes/PaintCanvas` as `paintcanvas/lib/classes/PaintCanvas`). `sideEffects` in `package.json` lists the UI modules that register elements when loaded (`src/ui/index.ts` and each `src/ui/elements/*/index.ts`), so bundlers keep them; add any other module that registers elements there.
