// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import IndexedDbDocumentStore, {
  DEFAULT_DOCUMENT_STORE_NAME,
  DOCUMENT_DATABASE_NAME,
  DOCUMENT_DATABASE_VERSION,
  summarise,
} from "..";
import type { DrawingDocument } from "../../document/schema";

/** A PNG-like image holding some text */
const image = (text: string) => new Blob([text], { type: "image/png" });

/** A document with an ID, opened at a time */
const documentOf = (id: string, dateOpened: string): DrawingDocument => ({
  id,
  name: `Drawing ${id}`,
  author: [{ name: "Ada" }],
  dateCreated: "2026-11-01T00:00:00.000Z",
  dateOpened,
  updatedAt: "2026-11-02T00:00:00.000Z",
  width: 30,
  height: 20,
  layers: [
    {
      id: "a",
      name: "Layer 1",
      visible: true,
      opacity: 1,
      blendingMode: "source-over",
      alphaLock: false,
      content: image("layer"),
    },
  ],
  activeLayer: "a",
  external: [{ source: "ann", content: image("sheet") }],
  thumbnail: { width: 3, height: 2, content: image("thumbnail") },
});

describe("summarise", () => {
  it("should keep a document's details, size and thumbnail, without its layers", () => {
    const document = documentOf("1", "2026-11-03T00:00:00.000Z");
    expect(summarise(document)).toEqual({
      id: "1",
      name: "Drawing 1",
      author: [{ name: "Ada" }],
      dateCreated: "2026-11-01T00:00:00.000Z",
      dateOpened: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
      width: 30,
      height: 20,
      thumbnail: document.thumbnail,
    });
  });
});

describe("IndexedDbDocumentStore", () => {
  it("should save, load, list (most recently opened first) and remove documents", async () => {
    const store = new IndexedDbDocumentStore("ada", {
      label: "This browser",
      factory: new IDBFactory(),
    });
    expect(store.name).toBe("ada");
    expect(store.label).toBe("This browser");
    expect(await store.list()).toEqual([]);
    expect(await store.load("1")).toBeUndefined();
    const older = documentOf("1", "2026-11-03T00:00:00.000Z");
    const newer = documentOf("2", "2026-11-04T00:00:00.000Z");
    const progress = vi.fn();
    await store.save(older, progress);
    expect(progress).toHaveBeenCalledWith(1);
    await store.save(newer);
    const loaded = await store.load("1");
    expect(loaded).toMatchObject({ id: "1", name: "Drawing 1" });
    expect(await loaded?.layers[0]?.content.text()).toBe("layer");
    const list = await store.list();
    expect(list.map(({ id }) => id)).toEqual(["2", "1"]);
    expect(list[0]).not.toHaveProperty("layers");
    expect(await list[0]?.thumbnail?.content.text()).toBe("thumbnail");
    // Saving again replaces it
    await store.save({ ...older, name: "Renamed" });
    expect((await store.load("1"))?.name).toBe("Renamed");
    await store.remove("2");
    expect(await store.load("2")).toBeUndefined();
    expect((await store.list()).map(({ id }) => id)).toEqual(["1"]);
  });

  it("should mark a document opened without changing when it was changed", async () => {
    const store = new IndexedDbDocumentStore("ada", {
      factory: new IDBFactory(),
    });
    await store.save(documentOf("1", "2026-11-03T00:00:00.000Z"));
    await store.save(documentOf("2", "2026-11-04T00:00:00.000Z"));
    await store.markOpened("1", new Date("2026-11-05T00:00:00.000Z"));
    await store.markOpened("gone");
    const [first] = await store.list();
    expect(first).toMatchObject({
      id: "1",
      dateOpened: "2026-11-05T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
    });
    expect((await store.load("1"))?.dateOpened).toBe(
      "2026-11-05T00:00:00.000Z",
    );
    expect(await store.load("gone")).toBeUndefined();
    vi.useFakeTimers({
      now: new Date("2030-01-01T00:00:00.000Z"),
      toFake: ["Date"],
    });
    await store.markOpened("2");
    vi.useRealTimers();
    expect((await store.list())[0]?.dateOpened).toBe(
      "2030-01-01T00:00:00.000Z",
    );
  });

  it("should keep documents under different names apart", async () => {
    const factory = new IDBFactory();
    const ada = new IndexedDbDocumentStore("ada", { factory });
    const bo = new IndexedDbDocumentStore("bo", { factory });
    await ada.save(documentOf("1", "2026-11-03T00:00:00.000Z"));
    expect(await bo.list()).toEqual([]);
    expect(await bo.load("1")).toBeUndefined();
  });

  it("should use the default name and the browser's IndexedDB", async () => {
    const store = new IndexedDbDocumentStore();
    expect(store.name).toBe(DEFAULT_DOCUMENT_STORE_NAME);
    await store.save(documentOf("1", "2026-11-03T00:00:00.000Z"));
    expect((await store.list()).map(({ id }) => id)).toEqual(["1"]);
  });

  it("should fail when reading fails", async () => {
    const store = new IndexedDbDocumentStore("ada", {
      factory: new IDBFactory(),
    });
    await store.list();
    const failed = { error: new Error("Read failed") } as {
      error: Error;
      onerror?: () => void;
    };
    vi.spyOn(IDBObjectStore.prototype, "get").mockImplementationOnce(() => {
      setTimeout(() => failed.onerror?.());
      return failed as unknown as IDBRequest;
    });
    await expect(store.load("1")).rejects.toThrow("Read failed");
    vi.restoreAllMocks();
  });

  it("should fail when a transaction is aborted, with its error or an abort error", async () => {
    const store = new IndexedDbDocumentStore("ada", {
      factory: new IDBFactory(),
    });
    const transaction = IDBDatabase.prototype.transaction;
    const abortNext = (error?: DOMException) =>
      vi
        .spyOn(IDBDatabase.prototype, "transaction")
        .mockImplementationOnce(function (this: IDBDatabase, ...args) {
          const created = transaction.apply(this, args);
          queueMicrotask(() => {
            if (error)
              Object.defineProperty(created, "error", { value: error });
            created.onabort?.(new Event("abort"));
          });
          return created;
        });
    await store.list();
    abortNext(new DOMException("The disk is full", "QuotaExceededError"));
    await expect(
      store.save(documentOf("1", "2026-11-03T00:00:00.000Z")),
    ).rejects.toThrow("The disk is full");
    abortNext();
    await expect(store.remove("1")).rejects.toThrow("aborted");
    vi.restoreAllMocks();
  });

  it("should report a database that can't be opened, and try again next time", async () => {
    const factory = new IDBFactory();
    // A newer version of the database makes opening this version fail
    await new Promise<void>((resolve) => {
      const request = factory.open(DOCUMENT_DATABASE_NAME, 99);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
    const open = vi.spyOn(factory, "open");
    const store = new IndexedDbDocumentStore("ada", { factory });
    await expect(store.list()).rejects.toBeDefined();
    await expect(store.list()).rejects.toBeDefined();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("should open the database again after another window upgrades it", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbDocumentStore("ada", { factory });
    await store.save(documentOf("1", "2026-11-03T00:00:00.000Z"));
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(
        DOCUMENT_DATABASE_NAME,
        DOCUMENT_DATABASE_VERSION + 1,
      );
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Blocked"));
    });
    const open = vi.spyOn(factory, "open");
    // The newer version is still there, so this version can't be opened again
    await expect(store.list()).rejects.toBeDefined();
    expect(open).toHaveBeenCalledOnce();
  });
});
