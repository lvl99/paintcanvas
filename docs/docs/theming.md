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

For the dark theme, set `data-pc-theme="dark"` on an ancestor (or `"auto"` to follow the device), or `theme="dark"` on a single element. `LIGHT_TOKENS` and `DARK_TOKENS` list every token.

`--pc-layers-menu-width` sets the width of `<pc-layers-menu>` (290px by default). In a narrow `<paint-canvas>`, a layers menu in a panel opened from the rail fills the panel.
