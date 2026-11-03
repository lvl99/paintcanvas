---
sidebar_position: 1
sidebar_label: Introduction
slug: /
---

# PaintCanvas

Open-source painting engine and renderer for the browser, with optional UI. Draw with a mouse, touch, or a pen or stylus with pressure and tilt.

- **Engine** (`@lvl99dotcom/paintcanvas/lib/*`): layers, brushes and erasers, custom brush presets, selection, transforms, clipboard, undo/redo, viewport, pen/touch/mouse input and rendering. No UI, and nothing is stored unless you ask (e.g. keeping the drawing in the browser).
- **Messages**: the engine sends and receives small drawing messages (patches of pixels, strokes, undo and redo), so you can share a drawing over any transport you choose.
- **UI** (`@lvl99dotcom/paintcanvas/ui`), optional: Lit web components, from buttons and sliders up to a full `<paint-canvas>` layout with slots for your own parts.

## Tools

| Kind                      | Tools                                                        |
| ------------------------- | ------------------------------------------------------------ |
| Painting and drawing      | Brush, eraser                                                |
| Masking                   | Rectangle, circle, polygon and freehand masks                |
| Manipulation              | Move, scale, rotate                                          |
| Constructive, destructive | Cut, copy, paste, delete, undo, redo                         |
| Colour sampling           | Sample a point, sample an area                               |
| Viewport                  | Zoom, pan                                                    |
| Layers                    | Visibility, order, blending mode, opacity, alpha lock, merge |

## Installation

```sh
npm install @lvl99dotcom/paintcanvas lit
```

[Lit](https://lit.dev) is a peer dependency, used by the UI only. The package is ES modules with TypeScript types.

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
      import "@lvl99dotcom/paintcanvas/ui";
      import { translations } from "@lvl99dotcom/paintcanvas/lib/i18n";

      await translations.useDeviceLocale();
    </script>
  </body>
</html>
```

Each folder of the engine and UI has its own import path, matching the [API](/api) pages: e.g. `@lvl99dotcom/paintcanvas/lib/classes/PaintCanvas` or `@lvl99dotcom/paintcanvas/ui/elements/PcButton`.

## Guides

- [Layout and slots](layout.md): the `<paint-canvas>` layout, its slots, side modes, state and keyboard shortcuts.
- [Using the engine](engine.md): build your own UI on the engine.
- [Messages and events](messages.md): share a drawing over your own transport.
- [Saving and opening drawings](documents.md): as files, and kept in the browser.
- [Translations](translations.md): choose the language, and add your app's own text.
- [Icons](icons.md)
- [Theming](theming.md)
