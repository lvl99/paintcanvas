// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import IndexedDbLayerStore, {
  DATABASE_NAME,
  SAVED_DRAWING_VERSION,
  type SavedDrawing,
} from "..";
import { BlendMode } from "../../classes/Layer";

/** A saved drawing with layers of these IDs (top first), the first selected */
const drawingOf = (...ids: string[]): SavedDrawing => ({
  version: SAVED_DRAWING_VERSION,
  width: 30,
  height: 20,
  layers: ids.map((id) => ({
    id,
    name: `Layer ${id}`,
    blendMode: BlendMode.Normal,
    opacity: 1,
    visible: true,
    alphaLock: false,
  })),
  activeLayer: ids[0] as string,
});

/** A PNG-like image holding some text */
const image = (text: string) => new Blob([text], { type: "image/png" });

/** The text an image holds, by layer ID */
const texts = async (images: Map<string, Blob> | undefined) =>
  Object.fromEntries(
    await Promise.all(
      [...(images ?? [])].map(async ([id, blob]) => [id, await blob.text()]),
    ),
  );

describe("IndexedDbLayerStore", () => {
  it("should have nothing saved at first", async () => {
    const store = new IndexedDbLayerStore("empty", new IDBFactory());
    expect(store.name).toBe("empty");
    expect(await store.load()).toBeUndefined();
  });

  it("should save a drawing and its layer images, and load them back", async () => {
    const store = new IndexedDbLayerStore("drawing", new IDBFactory());
    const drawing = drawingOf("a", "b");
    await store.save(
      drawing,
      new Map([
        ["a", image("top")],
        ["b", image("bottom")],
      ]),
    );
    const loaded = await store.load();
    expect(loaded?.drawing).toEqual(drawing);
    expect(await texts(loaded?.images)).toEqual({ a: "top", b: "bottom" });
    expect(loaded?.images.get("a")?.type).toBe("image/png");
  });

  it("should replace only the images given, and delete those of layers that are gone", async () => {
    const store = new IndexedDbLayerStore("drawing", new IDBFactory());
    await store.save(
      drawingOf("a", "b"),
      new Map([
        ["a", image("a1")],
        ["b", image("b1")],
      ]),
    );
    await store.save(drawingOf("c", "a"), new Map([["c", image("c1")]]));
    const loaded = await store.load();
    expect(loaded?.drawing.layers.map((layer) => layer.id)).toEqual(["c", "a"]);
    expect(await texts(loaded?.images)).toEqual({ a: "a1", c: "c1" });
  });

  it("should keep each name's drawing apart, and clear only its own", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbLayerStore("first", factory);
    const second = new IndexedDbLayerStore("second", factory);
    // A name that starts with the other's
    const longer = new IndexedDbLayerStore("first-copy", factory);
    await first.save(drawingOf("a"), new Map([["a", image("first")]]));
    await second.save(drawingOf("a"), new Map([["a", image("second")]]));
    await longer.save(drawingOf("b"), new Map([["b", image("longer")]]));
    expect(await texts((await first.load())?.images)).toEqual({
      a: "first",
    });
    await first.clear();
    expect(await first.load()).toBeUndefined();
    expect(await texts((await second.load())?.images)).toEqual({
      a: "second",
    });
    expect(await texts((await longer.load())?.images)).toEqual({
      b: "longer",
    });
  });

  it("should use the browser's IndexedDB by default", async () => {
    const store = new IndexedDbLayerStore("default");
    await store.save(drawingOf("a"), new Map([["a", image("x")]]));
    expect((await store.load())?.drawing.layers).toHaveLength(1);
    await store.clear();
  });

  it("should fail a save that can't be stored, keeping what was saved", async () => {
    const store = new IndexedDbLayerStore("drawing", new IDBFactory());
    await store.save(drawingOf("a"), new Map([["a", image("kept")]]));
    // A function can't be stored, so the transaction is aborted
    const broken = {
      ...drawingOf("a"),
      extra: () => undefined,
    } as unknown as SavedDrawing;
    await expect(store.save(broken, new Map())).rejects.toBeDefined();
    await expect(
      store.save(drawingOf("a"), new Map([["a", image("next")]])),
    ).resolves.toBeUndefined();
    expect(await texts((await store.load())?.images)).toEqual({ a: "next" });
  });

  it("should fail when reading fails", async () => {
    const store = new IndexedDbLayerStore("drawing", new IDBFactory());
    const failed = { error: new Error("Read failed") } as {
      error: Error;
      onerror?: () => void;
    };
    vi.spyOn(IDBObjectStore.prototype, "get").mockImplementationOnce(() => {
      setTimeout(() => failed.onerror?.());
      return failed as unknown as IDBRequest;
    });
    await expect(store.load()).rejects.toThrow("Read failed");
    vi.restoreAllMocks();
  });

  it("should fail when a transaction is aborted, with its error or an abort error", async () => {
    const store = new IndexedDbLayerStore("drawing", new IDBFactory());
    const transaction = IDBDatabase.prototype.transaction;
    const abortNext = (error?: DOMException) =>
      vi
        .spyOn(IDBDatabase.prototype, "transaction")
        .mockImplementationOnce(function (this: IDBDatabase, ...args) {
          const created = transaction.apply(this, args);
          // After the store listens, before the transaction completes
          queueMicrotask(() => {
            if (error)
              Object.defineProperty(created, "error", { value: error });
            created.onabort?.(new Event("abort"));
          });
          return created;
        });
    // Opened first, so only the store's own transactions fail
    await store.load();
    abortNext(new DOMException("The disk is full", "QuotaExceededError"));
    await expect(store.save(drawingOf("a"), new Map())).rejects.toThrow(
      "The disk is full",
    );
    abortNext();
    await expect(store.clear()).rejects.toThrow("aborted");
    vi.restoreAllMocks();
  });

  it("should report a database that can't be opened, and try again next time", async () => {
    const factory = new IDBFactory();
    // A newer version of the database makes opening this version fail
    await new Promise<void>((resolve) => {
      const request = factory.open(DATABASE_NAME, 99);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
    const store = new IndexedDbLayerStore("drawing", factory);
    await expect(store.load()).rejects.toBeDefined();
    await expect(store.load()).rejects.toBeDefined();
  });

  it("should let another window upgrade the database, opening it again when next needed", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbLayerStore("drawing", factory);
    await store.save(drawingOf("a"), new Map([["a", image("x")]]));
    // Another window opens a newer version: this one closes its connection so the upgrade can go ahead
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, 2);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Blocked"));
    });
    // Opening the old version again now fails, as the database is newer
    await expect(store.load()).rejects.toBeDefined();
  });
});
