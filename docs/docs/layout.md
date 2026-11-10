---
sidebar_position: 2
sidebar_label: Layout and slots
---

# The layout and its slots

```
┌──────────────────── header ────────────────────┐
│      │           top (tool settings)   │       │
│ left │                                 │ right │
│(tool-│      center (canvas)            │       │
│ bar) │      + overlay                  │       │
│      │           bottom                │       │
└──────────────────── footer ────────────────────┘
```

| Slot      | Default content                                                                       |
| --------- | ------------------------------------------------------------------------------------- |
| `header`  | Nothing                                                                               |
| `left`    | `<pc-toolbar>`, a pane of the colours and tools, then undo, redo, layers and the menu |
| `top`     | A horizontal `<pc-pane>` with `<pc-tool-settings>` for the tool                       |
| `center`  | `<pc-canvas>`                                                                         |
| `overlay` | `<pc-canvas-map>`, over the canvas                                                    |
| `bottom`  | Nothing                                                                               |
| `right`   | A `<pc-pane>` with `<pc-panel-layers>`                                                |
| `footer`  | `<pc-stats>`                                                                          |
| `menu`    | Opened by the toolbar's menu button, in a `<pc-panel>`                                |

Put your own element in a slot to replace its default. Empty areas take no space. While a side has a `<pc-panel-layers>` (as the right side does by default), the toolbar has no layers button. On its own, `<pc-toolbar>` leaves the button out with `.layers=${false}`.

While the layout is narrow (below `narrow-width`, 600px by default), toolbars in the sides are minimised: their tools become one button showing the current tool's icon, which opens a menu of the tools. On its own, set `minimised` on `<pc-toolbar>`.

```html
<paint-canvas menu-text="App" menu-label="App menu">
  <pc-pane slot="right">
    <pc-panel-layers></pc-panel-layers>
    <pc-panel icon="chat" label="Chat"><my-chat></my-chat></pc-panel>
  </pc-pane>
  <nav slot="menu">…</nav>
</paint-canvas>
```

## Before the elements load

Until the scripts load, `<paint-canvas>` and the content you put in its slots (e.g. menu buttons' text) show as plain, unstyled HTML. Hide them with CSS in the page's `<head>`, which applies from the first paint, and show something small in their place until `<paint-canvas>` is defined:

```html
<style>
  :root {
    color-scheme: light dark; /* the device's light or dark background straight away */
  }
  paint-canvas:not(:defined) {
    visibility: hidden;
  }
  paint-canvas:defined ~ .loading {
    display: none;
  }
</style>
<paint-canvas>…</paint-canvas>
<div class="loading" role="status">Loading…</div>
```

The demo does this with a thin bar across the top.

## Panes, panels and menus

The layout's areas are built from a few kinds of elements, each sharing its look and behaviour with the others of its kind:

- **Panes** (`<pc-pane>`): areas where buttons and panels are shown or docked, with `start`, `middle` and `end` slots (content without a slot goes at the start). They run `vertical` (the sides) or `horizontal` (the top); the middle takes the space left. `<pc-toolbar>` is a pane.
- **Panels** (`<pc-panel>`, and panels made for one purpose that extend `PcPanel`: `<pc-panel-layers>`, `<pc-panel-brushes>` and `<pc-panel-colours>`): boxes of settings or content, with `header`, `body` and `footer` slots (content without a slot goes in the body). A panel's `icon`, `label` and `badge` (a dot meaning something new) are shown on its rail button.
- **Menus** (`<pc-menu>`): lists of items, each with an optional icon or checkmark and keyboard shortcut, with optional non-interactive labels (`{ type: "label", label }`) and dividers (`{ type: "divider" }`) between them. An item with `selected: true` is the current choice: it gets the `selected` class and a purple background (e.g. the current tool in the minimised toolbar's menu). `<pc-context-menu>` is a button (its `icon` slot, ⋮ by default) that opens one: a `pc-menu` in its `menu` slot, or its own of `items`.

```html
<pc-context-menu label="Layer actions" .items="${items}" @pc-select="${(e)" ="">
  act(e.detail.value)}></pc-context-menu
>
```

## Side modes

Each side (`left` and `right`) is shown in one of four modes, chosen by the layout's width. The layout gives the mode to the side's panes (its own, or `<pc-pane>`s you give the side), so give side content in a pane:

- `docked`: beside the canvas.
- `rail`: a column of buttons, one per panel in the pane. Each button opens its panel over the canvas; Escape or a press outside closes it. Open one from code with `pane.togglePanel(panel)`.
- `floating`: the pane floats over the canvas as a box that starts collapsed to a button.
- `overlay`: a rail over the canvas, which fills the width behind it. The pane has no background; each button has its own, and presses between them reach the canvas. Its panels stay solid. The toolbar's own panels (e.g. the brush presets) open beside a left overlay. When fitting the drawing, the canvas keeps it clear of the overlay.

Set the rules with `left-modes` and `right-modes`: a mode, then `mode@width` for layouts narrower than that width. The default is `"docked, floating@600"`.

```html
<paint-canvas right-modes="docked, rail@800, floating@400"></paint-canvas>
```

## Layout state

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

## Keyboard shortcuts

The layout handles keyboard shortcuts (tools, brush size and opacity, undo and redo, selection, clipboard, fills, zoom, layer opacity, Tab to hide the interface, Cmd/Ctrl + S to save a PNG). Set `.shortcuts=${false}` to handle them yourself with `KeyboardShortcuts` (`@lvl99dotcom/paintcanvas/lib/classes/KeyboardShortcuts`), which dispatches `pc-shortcut` for actions it leaves to you.

`SHORTCUT_DEFINITIONS` (`@lvl99dotcom/paintcanvas/lib/utils/shortcuts`) lists every action and its default key combination. Users can change the key combinations of the configurable ones, kept in `canvas.shortcuts`:

```ts
canvas.shortcuts.set("tool-brush", { key: "p" }); // { changed: true }
canvas.shortcuts.set("tool-brush", { key: "e" }); // { changed: true, movedFrom: "tool-eraser" }
canvas.shortcuts.set("deselect", { key: "z", cmd: true }); // { changed: false, fixed: "undo" }
canvas.shortcuts.set("deselect", null); // no key combination
canvas.shortcuts.load(saved); // e.g. from storage; dispatches "change"
```

`<pc-shortcut-settings .settings=${canvas.shortcuts}>` lists every action in its group: users change a key combination by focusing its field and pressing the keys, and remove it with its ⨉ button. `<pc-app-settings .app=${canvas}>` has a "Keyboard shortcuts" button that opens it in a modal window, and buttons to import and export the app settings file. Shortcuts don't run while a `<dialog>` is open.

Cut, copy and paste (Cmd/Ctrl + X, C, V), undo and redo (Cmd/Ctrl + Z, Shift + Cmd/Ctrl + Z), Tab, Cmd/Ctrl + S, Delete/Backspace, Escape, Enter and 1–0 (layer opacity 10%–100%) are fixed. `cmd` is Command on Apple devices and Ctrl elsewhere; `ctrl` is Control on Apple devices only.

### Copying and pasting

Copying or cutting masked image data also puts it on the system clipboard as a PNG (pass `systemClipboard: null` to `PaintCanvas` to stop this), so it can be pasted into other apps, or as a brush shape with the brush configuration window's Paste button (which uses the canvas's copy if the browser won't let it read the clipboard). Pasting (Cmd/Ctrl + V, or the browser's own paste) pastes an image copied in another app in the middle of the view, to place with the Move tool, unless image data was copied on the canvas since the window last lost focus: that is pasted where it was copied from. Call `canvas.pasteImage(image)` to paste an image yourself.

Cut, Copy and Paste are `<pc-clipboard-tools>`, at the end of the layout's top pane after the tool settings, for the brush, eraser, lassos and Move tool (`CLIPBOARD_TOOLS`); Paste is on only while there's copied image data. While the layout is narrow, they're one ⋮ menu. The tool settings bar (`<pc-tool-settings>`) has `start` and `end` slots for your own buttons; the brush and eraser's pressure, tilt and focus pen mode are in the size settings popover (the cog), above the width and height.

Key presses are matched on keyboards with any layout:

- Letters follow the key's label, e.g. `a` on a French keyboard.
- Digits and symbols ignore the Shift or AltGr/Option used to type them, e.g. `<` and `[` on a German keyboard.
- When a key types a character outside basic Latin (another alphabet, or Option on macOS) or is a dead key, its physical key is used, e.g. `cmd a` with a Russian layout.
- `=` counts as `+`, so `cmd +` works with or without Shift.
- Key presses while composing text (e.g. with a Japanese input method) are ignored.

## Keeping the user's settings

With a `settings-store` name, the layout keeps the user's app settings in the browser (IndexedDB) under that name: input settings, keyboard shortcuts, the colour palette, the foreground and background colours, the user's own profile graphs (`canvas.profiles`, a `ProfileGraphs`), and the theme, language and rendering (`canvas.ui`, a `UiSettings`). Saved settings are restored when the layout starts (`layout.settingsAutosave.ready` resolves once they are), and changes are saved soon after they happen. The rendering (CPU or GPU) is also kept in `localStorage`, so the canvas the layout makes draws where the user last chose; a change applies after reloading the page (see [Drawing on the CPU or the GPU](engine.md#drawing-on-the-cpu-or-the-gpu)).

```html
<paint-canvas settings-store="default"></paint-canvas>
```

The theme and language are applied by the elements that change them, given the canvas's `ui`: `<pc-theme-picker>` (`picker.settings = canvas.ui`) sets the page's theme, and `<pc-input-settings>` (`inputSettings.ui = canvas.ui`) switches the language. Until the user picks a language, the device's is used.

Without the layout, use `SettingsAutosave` (`@lvl99dotcom/paintcanvas/lib/classes/SettingsAutosave`) with `IndexedDbSettingsStore` (`@lvl99dotcom/paintcanvas/lib/storage`), or your own store with `load` and `save`. Settings are exported and imported as JSON files matching `settingsFileSchema` from `@lvl99dotcom/paintcanvas/lib/settings`:

```ts
import {
  applySettings,
  collectSettings,
  exportSettingsFile,
  parseSettingsFile,
} from "@lvl99dotcom/paintcanvas/lib/settings";

const text = exportSettingsFile(collectSettings(canvas)); // { "format": "paintcanvas-settings", "version": 1, "settings": {...} }
applySettings(canvas, parseSettingsFile(text)); // throws a SettingsFileError for files that aren't compatible
```

## Keeping the drawing

With a `store` name, the layout keeps the user's layers in the browser, so the drawing survives reloading the page. While another window is drawing on the same name, the layout is blocked by a message offering to draw here instead. See [Saving and opening drawings](documents.md#keeping-the-drawing-in-the-browser).

```html
<paint-canvas store="my-drawing"></paint-canvas>
```
