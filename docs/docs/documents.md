---
sidebar_position: 5
---

# Saving and opening drawings

A drawing is a document: its details (an ID, a name, its authors, when it was made, last opened and last changed), its size, the user's layers, drawings from other sources and a thumbnail. Undo history isn't kept.

```ts
const document = await canvas.createDocument(); // a DrawingDocument: images are PNG blobs
await canvas.openDocument(document); // false if it can't be opened

const json = JSON.stringify(await canvas.exportDocument()); // a DocumentFile: images are PNG data URLs
await canvas.importDocument(JSON.parse(json)); // false if the document isn't valid
```

- Document files match the [document schema](./schemas.md) (`document-1.1.0.json`, `@type` `PaintCanvas/Document`). `documentToFile` and `documentFromFile` (`@lvl99dotcom/paintcanvas/lib/document`) turn documents into files and back; files from before versioned schemas (`format: "paintcanvas-document"`) are read too, with new details.
- `canvas.documentInfo` has the drawing's details. `canvas.renameDocument(name)` renames it, and `canvas.newDocument(name?)` starts a new drawing with one empty layer.
- `documentInfo.updatedAt` is when the drawing was last changed: its layers' pixels or settings, their order, adding or deleting layers, the canvas size, or its name. Nothing is marked while the user draws: once a change is made, the canvas waits until the drawing has gone unchanged for 100 ms (`MODIFIED_DEBOUNCE_MS`, each change restarts the wait), then sets `updatedAt` to that moment and dispatches `modified` (`DOCUMENT_MODIFIED_EVENT`). `createDocument()`, `LayerAutosave` and `RemoteDocumentAutosave` mark a waiting change first (`canvas.flushModified()`), so none is missed. `canvas.destroy()` stops the wait. Selecting a layer, opening or restoring a drawing, other people's drawings, and being added as an author don't change it. A new drawing starts with its `dateCreated`, and so does one opened from before documents had it.
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

## Keeping the drawing somewhere else

Besides the browser, the whole drawing can be kept in a remote store, e.g. the user's account online. Saving there takes longer, so it happens less often: every 5 minutes (`REMOTE_SAVE_INTERVAL_MS`) while there are changes, or when asked. In `idle` mode, it saves once the drawing has gone unchanged for a minute (`idleMs`, default `REMOTE_IDLE_MS`), and when the page is hidden or the window loses focus. Only changes to the drawing count (the canvas's `modified` event).

```ts
canvas.useRemoteDocumentStore(myAccountStore, { intervalMs: 10 * 60 * 1000 });
canvas.useRemoteDocumentStore(myAccountStore, { mode: "idle" });
// or: new PaintCanvas({ remoteDocumentStore: myAccountStore })

await canvas.remoteAutosave?.save(); // save now, e.g. from a "Save" button
```

- A remote store has the `DocumentStoreLike` methods: `save(document, onProgress)` (the whole document, with its PNG blobs and thumbnail; call `onProgress` with how much is done, 0 to 1, if known) and `load(id)`. Its optional `label` names it for the user, e.g. "Bluesky".
- `canvas.remoteAutosave` (a `RemoteDocumentAutosave`) has `saving`, `progress`, `lastSaved`, `hasChanges` and `error`, and dispatches `change` and `error`. A failed save is tried again next time.
- While it saves, `<pc-stats>` shows "Saving to …" with a progress bar on the right, and says so if saving failed.
- To open a document from the store, use `canvas.openDocument(await myAccountStore.load(id))`.
- `IndexedDbDocumentStore` (`@lvl99dotcom/paintcanvas/lib/documentStore`, optional) is a document store in the browser's IndexedDB, under a name. Besides `save` and `load`, `list()` gives each saved document's details, size and thumbnail (a `DocumentSummary`, most recently opened first) without loading its layers, `remove(id)` deletes one, and `markOpened(id)` marks one opened now without changing its `updatedAt`.

  ```ts
  import IndexedDbDocumentStore from "@lvl99dotcom/paintcanvas/lib/documentStore";

  const store = new IndexedDbDocumentStore("ada.example");
  await store.save(await canvas.createDocument());
  const [latest] = await store.list();
  await canvas.openDocument((await store.load(latest.id))!);
  await store.markOpened(latest.id);
  ```

- `MemoryDocumentStore` (`@lvl99dotcom/paintcanvas/testing/documentStore`) keeps documents in memory, optionally taking its time, for tests and trying it out. The demo uses it with `?remote` in its address.
