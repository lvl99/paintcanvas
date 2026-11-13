import { describe, it, expect, vi } from "vitest";
import AssetSync, { ASSET_SYNC_ERROR_EVENT, type SyncedAssets } from "..";
import type { Asset, AssetAuthor } from "../../../assets/schema";

/** A test asset whose content is text */
type Note = Asset<string>;

/** A note with an ID and text */
const note = (id: string, content: string): Note => ({
  "@type": "Test/Note",
  id,
  name: id,
  author: "Ada",
  content,
});

/** Notes kept in memory */
class Notes extends EventTarget implements SyncedAssets<Note> {
  items: Note[] = [];

  /** The author last given to `merge` */
  author?: AssetAuthor;

  merge(items: unknown[], author?: AssetAuthor): void {
    this.author = author;
    const valid = items.filter(
      (item): item is Note => typeof (item as Note)?.content === "string",
    );
    const ids = new Set(valid.map((note) => note.id));
    this.items = [...this.items.filter((note) => !ids.has(note.id)), ...valid];
    this.change();
  }

  change(items: Note[] = this.items): void {
    this.items = items;
    this.dispatchEvent(new Event("change"));
  }
}

/** A store kept in memory */
const fakeStore = (saved: unknown[] = []) => ({
  list: vi.fn(async () => saved),
  put: vi.fn(async (note: Note) => void note),
  remove: vi.fn(async (id: string) => void id),
});

const a = note("a", "A");
const b = note("b", "B");

describe("AssetSync", () => {
  it("should add the saved assets, then save ones only in memory and delete invalid saved ones", async () => {
    const notes = new Notes();
    notes.items = [b];
    const store = fakeStore([a, { id: "bad" }, null]);
    const sync = new AssetSync(notes, store);
    expect(sync.assets).toBe(notes);
    expect(sync.store).toBe(store);
    await sync.ready;
    expect(notes.items).toEqual([b, a]);
    expect(store.put.mock.calls).toEqual([[b]]);
    expect(store.remove.mock.calls).toEqual([["bad"]]);
    expect(notes.author).toBeUndefined();
  });

  it("should give the author of older saved assets to the assets added", async () => {
    const notes = new Notes();
    const sync = new AssetSync(notes, fakeStore([a]), () => "Bo");
    expect(sync.author?.()).toBe("Bo");
    await sync.ready;
    expect(notes.author).toBe("Bo");
  });

  it("should save changed assets and delete removed ones, one change after another", async () => {
    const notes = new Notes();
    const store = fakeStore([a, b]);
    const sync = new AssetSync(notes, store);
    await sync.ready;
    expect(store.put).not.toHaveBeenCalled();
    notes.change([{ ...a, content: "Ay" }, b]);
    notes.change([{ ...a, content: "Ay" }]);
    await vi.waitFor(() => expect(store.remove).toHaveBeenCalledWith("b"));
    expect(store.put.mock.calls).toEqual([[{ ...a, content: "Ay" }]]);
    sync.stop();
    notes.change([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.remove).toHaveBeenCalledTimes(1);
  });

  it("should tell listeners when loading or saving fails, and keep going", async () => {
    const notes = new Notes();
    const store = fakeStore();
    store.list.mockRejectedValueOnce(new Error("blocked"));
    store.put.mockRejectedValueOnce(new Error("full"));
    const errors: unknown[] = [];
    const sync = new AssetSync(notes, store);
    sync.addEventListener(ASSET_SYNC_ERROR_EVENT, (event) =>
      errors.push((event as CustomEvent).detail),
    );
    await sync.ready;
    notes.change([a]);
    await vi.waitFor(() => expect(errors).toHaveLength(2));
    expect(errors.map((error) => (error as Error).message)).toEqual([
      "blocked",
      "full",
    ]);
    // Not saved, so tried again with the next change
    notes.change([a]);
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledTimes(2));
  });

  it("should do nothing once stopped, even while loading", async () => {
    const notes = new Notes();
    const store = fakeStore([a]);
    const sync = new AssetSync(notes, store);
    sync.stop();
    await sync.ready;
    expect(notes.items).toEqual([]);
    notes.change([b]);
    expect(store.put).not.toHaveBeenCalled();
  });

  it("should do nothing once stopped while loading fails", async () => {
    const notes = new Notes();
    const store = fakeStore();
    store.list.mockRejectedValueOnce(new Error("offline"));
    const sync = new AssetSync(notes, store);
    sync.stop();
    await sync.ready;
    notes.change([b]);
    expect(store.put).not.toHaveBeenCalled();
  });

  it("should not save a change waiting behind a save once stopped", async () => {
    const notes = new Notes();
    const store = fakeStore();
    const sync = new AssetSync(notes, store);
    await sync.ready;
    let finish = () => {};
    store.put.mockImplementationOnce(
      () =>
        new Promise<undefined>(
          (resolve) => (finish = () => resolve(undefined)),
        ),
    );
    notes.change([a]);
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledOnce());
    // Waits for the save of `a`
    notes.change([a, b]);
    sync.stop();
    finish();
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.put).toHaveBeenCalledOnce();
  });
});
