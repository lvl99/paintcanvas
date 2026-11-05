---
sidebar_position: 7
---

# Icons

Replace any icon, or add your own, with an image URL (e.g. an SVG data URL):

```ts
import { icons } from "@lvl99dotcom/paintcanvas/ui";

icons.register({ brush: "/my-icons/brush.svg", chat: "/my-icons/chat.svg" });
```

Elements update when icons change. `DEFAULT_ICONS` lists the names.

The icons that come with PaintCanvas are 128 × 128 PNGs. Their source artwork, 64 × 64 SVGs to derive or change your own from, is in the repository's [`src/ui/icons/images`](https://github.com/lvl99/paintcanvas/tree/main/src/ui/icons/images) folder, next to the PNGs made from it.
