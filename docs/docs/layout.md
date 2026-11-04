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

| Slot      | Default content                                                                              |
| --------- | -------------------------------------------------------------------------------------------- |
| `header`  | Nothing                                                                                      |
| `left`    | `<pc-toolbar>`                                                                               |
| `top`     | `<pc-tool-settings>` for the tool                                                            |
| `center`  | `<pc-canvas>`                                                                                |
| `overlay` | `<pc-canvas-map>`, over the canvas                                                           |
| `bottom`  | Nothing                                                                                      |
| `right`   | Nothing                                                                                      |
| `footer`  | `<pc-stats>`                                                                                 |
| `menu`    | Opened by the toolbar's menu button, floating with the panels' shadow (give it a background) |

Put your own element in a slot to replace its default. Empty areas take no space. A `<pc-panel-layers>` in the `left` or `right` slot (e.g. in a `<pc-panel>`, as below) replaces the toolbar's layers button. On its own, `<pc-toolbar>` leaves the button out with `.layers=${false}`.

```html
<paint-canvas menu-text="App" menu-label="App menu">
  <pc-panel slot="right" icon="layers" label="Layers">
    <pc-panel-layers></pc-panel-layers>
  </pc-panel>
  <nav slot="menu">…</nav>
</paint-canvas>
```

## Side modes

Each side (`left` and `right`) is shown in one of three modes, chosen by the layout's width:

- `docked`: beside the canvas.
- `rail`: a column of buttons, one per `<pc-panel>` in the side. Each button opens its panel over the canvas; Escape or a press outside closes it.
- `floating`: over the canvas as a palette that starts collapsed to a button.

Set the rules with `left-modes` and `right-modes`: a mode, then `mode@width` for layouts narrower than that width. The default is `"docked, rail@600"`.

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

Key presses are matched on keyboards with any layout:

- Letters follow the key's label, e.g. `a` on a French keyboard.
- Digits and symbols ignore the Shift or AltGr/Option used to type them, e.g. `<` and `[` on a German keyboard.
- When a key types a character outside basic Latin (another alphabet, or Option on macOS) or is a dead key, its physical key is used, e.g. `cmd a` with a Russian layout.
- `=` counts as `+`, so `cmd +` works with or without Shift.
- Key presses while composing text (e.g. with a Japanese input method) are ignored.

## Keeping the user's settings

With a `settings-store` name, the layout keeps the user's app settings in the browser (IndexedDB) under that name: input settings, keyboard shortcuts, the colour palette and the foreground and background colours. Saved settings are restored when the layout starts (`layout.settingsAutosave.ready` resolves once they are), and changes are saved soon after they happen.

```html
<paint-canvas settings-store="default"></paint-canvas>
```

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
