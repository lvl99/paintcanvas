---
sidebar_position: 5
---

# Saving and opening drawings

```ts
const json = JSON.stringify(await canvas.exportDocument());
await canvas.importDocument(JSON.parse(json)); // false if the document isn't valid
```

A document holds the canvas size, the user's layers and drawings from other sources, with PNG images.
