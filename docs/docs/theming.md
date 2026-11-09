---
sidebar_position: 8
---

# Theming

The look comes from CSS custom properties named `--pc-*` (colours, spacing, fonts, shadows). Override any on `:root` or on an ancestor:

```css
:root {
  --pc-accent: #0a7d55;
  --pc-font: "Inter", sans-serif;
}
```

The page follows the device's theme (light or dark) by default. To choose one, set `data-pc-theme="light"` or `"dark"` on the page's root element or any ancestor (`"system"` follows the device), or `theme="dark"` on a single element. `LIGHT_TOKENS` and `DARK_TOKENS` list every token. Besides colours, sizes and fonts, `--pc-delete-cursor` is the cursor over something a click deletes (an "X" over brush presets and saved colours while Alt/Option is held).

To let the user choose, add `<pc-theme-picker>`: three radios, light (sun), dark (moon) and system (star, picked by default). It sets `data-pc-theme` on the page's root element (or on its `target`) and fires `change` with the theme. To keep the theme with the user's app settings (see [Keeping the user's settings](layout.md#keeping-the-users-settings)), give it the canvas's `ui`; it then also sets the page's theme when the saved one is restored:

```ts
picker.settings = canvas.ui;
```

`--pc-panel-width` sets how wide panels are (`<pc-panel>` and the panels made from it, e.g. `<pc-panel-layers>`): 290px by default, and 240px for `<pc-panel-brushes>`. In every layout (docked, opened from a rail or overlay, narrow or not), panels are never wider than `--pc-panel-max-width` (290px by default) or the space they have.

Pill buttons come in five sizes (least height, font size, padding): `pill-s` (24px, 14px, 2px 8px), `pill` (32px, 16px, 8px 16px, the usual size), `pill-l` (50px, 20px, 15px 25px), `pill-xl` (75px, 24px, 25px 37px) and `pill-xxl` (100px, 28px, 36px 50px). Give `<pc-button>` one as its `size` (`pill` by default), or use them as classes on `<button>`s in your own elements with the shared `pills` styles from `@lvl99dotcom/paintcanvas/ui/styles` (`PILL_SIZE_STYLES` lists them):

```ts
html`<pc-button size="pill-l">Start</pc-button>`;
```
