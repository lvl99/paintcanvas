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
