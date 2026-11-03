---
sidebar_position: 5
---

# Saving and opening drawings

```ts
const json = JSON.stringify(await canvas.exportDocument());
await canvas.importDocument(JSON.parse(json)); // false if the document isn't valid
```

A document holds the canvas size, the user's layers and drawings from other sources, with PNG images.

## Keeping the drawing in the browser

To keep the user's layers through a page reload, give the layout a `store` name. The layers are kept in the browser's IndexedDB under that name:

```html
<paint-canvas store="my-drawing"></paint-canvas>
```

Or give the engine a store yourself:

```ts
import IndexedDbLayerStore from "paintcanvas/lib/storage";

canvas.useLayerStore(new IndexedDbLayerStore("my-drawing"));
// or: new PaintCanvas({ layerStore: new IndexedDbLayerStore("my-drawing") })
```

- The saved drawing is restored when the page opens: the canvas size, each layer's settings and pixels, and the selected layer. Undo history isn't kept.
- Changes are saved soon after they're made (once drawing pauses), and straight away when the page is hidden or closed. Only layers whose pixels changed are saved again.
- Only one window draws on a drawing at a time. Another window or tab opening the same name is blocked by a message, "You are already drawing in another window", with a button to draw there instead (the first window is then blocked). When the first window closes, the other takes the drawing over the next time it's shown.
- If the saved drawing can't be loaded (e.g. it was saved by another version), saving stops so it isn't overwritten, and `pc-toast` tells the user. `canvas.autosave.store.clear()` deletes it.
- To start again with an empty drawing, replace the layers, e.g. `canvas.layers.replace([{ name: "Layer 1" }])`. The saved drawing follows.

`canvas.autosave` (a `LayerAutosave`) has the state (`starting`, `elsewhere`, `ready` or `stopped`) and dispatches `change` and `error`. To keep layers somewhere else (e.g. your server), pass your own store with the same methods as `LayerStoreLike`: `load`, `save` and `clear`. The test helpers include `MemoryLayerStore` (`paintcanvas/testing/layerStore`) and fake Web Locks (`paintcanvas/testing/locks`).
