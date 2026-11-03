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

Put your own element in a slot to replace its default. Empty areas take no space. A `<pc-layers-menu>` in the `left` or `right` slot (e.g. in a `<pc-panel>`, as below) replaces the toolbar's layers button. On its own, `<pc-toolbar>` leaves the button out with `.layers=${false}`.

```html
<paint-canvas menu-text="App" menu-label="App menu">
  <pc-panel slot="right" icon="layers" label="Layers">
    <pc-layers-menu></pc-layers-menu>
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

The layout handles keyboard shortcuts (tools, brush size, undo and redo, selection, clipboard, Tab to hide the interface, Cmd/Ctrl + S to save a PNG). Set `.shortcuts=${false}` to handle them yourself with `KeyboardShortcuts` (`paintcanvas/lib/classes/KeyboardShortcuts`), which dispatches `pc-shortcut` for actions it leaves to you.

## Keeping the drawing

With a `store` name, the layout keeps the user's layers in the browser, so the drawing survives reloading the page. While another window is drawing on the same name, the layout is blocked by a message offering to draw here instead. See [Saving and opening drawings](documents.md#keeping-the-drawing-in-the-browser).

```html
<paint-canvas store="my-drawing"></paint-canvas>
```
