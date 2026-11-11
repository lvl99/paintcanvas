---
sidebar_position: 5
---

# Saving and opening drawings

A drawing is a document: its details (an ID, a name, its authors, when it was made and last opened), its size, the user's layers, drawings from other sources and a thumbnail. Undo history isn't kept.

```ts
const document = await canvas.createDocument(); // a DrawingDocument: images are PNG blobs
await canvas.openDocument(document); // false if it can't be opened

const json = JSON.stringify(await canvas.exportDocument()); // a DocumentFile: images are PNG data URLs
await canvas.importDocument(JSON.parse(json)); // false if the document isn't valid
```

- Document files match the [document schema](./schemas.md) (`document-1.0.0.json`, `@type` `PaintCanvas/Document`). `documentToFile` and `documentFromFile` (`@lvl99dotcom/paintcanvas/lib/document`) turn documents into files and back; files from before versioned schemas (`format: "paintcanvas-document"`) are read too, with new details.
- `canvas.documentInfo` has the drawing's details. `canvas.renameDocument(name)` renames it, and `canvas.newDocument(name?)` starts a new drawing with one empty layer.
- The user (the `presetAuthor` option) starts a drawing's authors, and whoever saves it later (with `createDocument`) is added.
- The thumbnail is the drawing as shown, at most `THUMBNAIL_SIZE` (200) pixels on its longest side. Leave it out with `createDocument({ thumbnail: false })`.

## Keeping the drawing in the browser

To keep the user's layers through a page reload, give the layout a `store` name. The layers are kept in the browser's IndexedDB under that name:

```html
<paint-canvas store="my-drawing"></paint-canvas>
```

Or give the engine a store yourself:

```ts
import IndexedDbLayerStore from "@lvl99dotcom/paintcanvas/lib/storage";

canvas.useLayerStore(new IndexedDbLayerStore("my-drawing"));
// or: new PaintCanvas({ layerStore: new IndexedDbLayerStore("my-drawing") })
```

- The saved drawing is restored when the page opens: its details, the canvas size, each layer's settings and pixels, and the selected layer. Undo history isn't kept.
- Changes are saved soon after they're made (once drawing pauses), and straight away when the page is hidden or closed. Only layers whose pixels changed are saved again.
- Only one window draws on a drawing at a time. Another window or tab opening the same name is blocked by a message, "You are already drawing in another window", with a button to draw there instead (the first window is then blocked). When the first window closes, the other takes the drawing over the next time it's shown.
- If the saved drawing can't be loaded (e.g. it was saved by another version), saving stops so it isn't overwritten, and `pc-toast` tells the user. `canvas.autosave.store.clear()` deletes it.
- To start again with an empty drawing, use `canvas.newDocument()`. The saved drawing follows.

`canvas.autosave` (a `LayerAutosave`) has the state (`starting`, `elsewhere`, `ready` or `stopped`) and dispatches `change` and `error`. To keep layers somewhere else (e.g. your server), pass your own store with the same methods as `LayerStoreLike`: `load`, `save` and `clear`. The test helpers include `MemoryLayerStore` (`@lvl99dotcom/paintcanvas/testing/layerStore`) and fake Web Locks (`@lvl99dotcom/paintcanvas/testing/locks`).
