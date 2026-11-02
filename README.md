# PaintCanvas

Open-source painting engine and renderer for the browser, with optional UI.

- **Engine** (`paintcanvas/lib/*`): layers, brushes and erasers, custom brush presets, selection, transforms, clipboard, undo/redo, viewport, pen/touch/mouse input and rendering. No UI and no storage.
- **Messages**: the engine sends and receives small drawing messages (patches of pixels, strokes, undo and redo), so you can share a drawing over any transport you choose.
- **UI** (`paintcanvas/ui`), optional: Lit web components, from buttons and sliders up to a full `<paint-canvas>` layout with slots for your own parts.

Licensed under the [Apache License 2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) to help.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Documentation](#documentation)
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

## Documentation

Guides and API pages are in [docs/](docs/), a [Docusaurus](https://docusaurus.io) site (`pnpm docs`). The guides:

- [The layout and its slots](docs/docs/layout.md)
- [Building your own UI on the engine](docs/docs/engine.md)
- [Messages and events](docs/docs/messages.md)
- [Saving and opening drawings](docs/docs/documents.md)
- [Translations](docs/docs/translations.md)
- [Icons](docs/docs/icons.md)
- [Theming](docs/docs/theming.md)

## Demo

```sh
pnpm dev
```

Starts a development server and opens the demo in your browser. It uses the source directly, so saving a change to `src/`, `demo/` or `locales/` reloads the page with the change straight away. (The whole page reloads because custom elements can't be redefined in a running page, so the drawing starts again.)

- http://localhost:5190/: a full-page PaintCanvas with a layers panel, a menu with input settings and a dark theme switch.
- http://localhost:5190/elements.html: the base elements.

To try it with a pen or touch on another device (e.g. a tablet) on the same network, run `pnpm dev --host` and open the network address it prints. This makes the server reachable by anyone on that network.

The UI text follows your device's languages: on an English (UK) device, edit `locales/en-GB.json` to see text changes.

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
- `docs/`: the documentation site (its own pnpm package): guides in `docs/docs/`, and API pages TypeDoc generates from the source's comments.

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
| `pnpm dev`              | Starts the demo, reloading it when files change (`pnpm demo` does the same)       |
| `pnpm docs`             | Starts the documentation site (`pnpm docs:build` builds it into `docs/build/`)    |

Each folder in `src/lib` and `src/ui` is published as its own import path (e.g. `src/lib/classes/PaintCanvas` as `paintcanvas/lib/classes/PaintCanvas`). `sideEffects` in `package.json` lists the UI modules that register elements when loaded (`src/ui/index.ts` and each `src/ui/elements/*/index.ts`), so bundlers keep them; add any other module that registers elements there.
