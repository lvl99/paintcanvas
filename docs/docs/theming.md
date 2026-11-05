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

To let the user choose, add `<pc-theme-picker>`: three radios, light (sun), dark (moon) and system (star, picked by default). It sets `data-pc-theme` on the page's root element (or on its `target`) and fires `change` with the theme, e.g. to remember it:

```html
<pc-theme-picker></pc-theme-picker>
```

`--pc-panel-width` sets how wide panels are (`<pc-panel>` and the panels made from it, e.g. `<pc-panel-layers>`): 290px by default, and 240px for `<pc-panel-brushes>`. Panels are never wider than the space they have.
