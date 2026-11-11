import { describe, it, expect, vi } from "vitest";
import CustomPresets from "..";
import type { BrushConfig } from "../../../brushes/types";
import type { AssetStoreLike } from "../../../storage";

const me = "me.example";

/** A store kept in memory */
const fakeStore = (saved: unknown[] = []) =>
  ({
    list: vi.fn(async () => saved),
    put: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  }) satisfies AssetStoreLike<BrushConfig>;

const mine = {
  id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
  name: "Soft",
  author: { name: "Me", handle: me },
};
const theirs = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  name: "Soft",
  author: { name: "Ann", handle: "ann.test" },
};

describe("CustomPresets", () => {
  it("should load the user's valid presets from the store and notify", async () => {
    const store = fakeStore([mine, { id: "not a UUID" }, null]);
    const custom = new CustomPresets(store);
    const listener = vi.fn();
    custom.addEventListener("change", listener);
    await custom.load();
    expect(store.list).toHaveBeenCalledOnce();
    expect(custom.presets).toEqual([mine]);
    expect(custom.get(mine.id)).toBe(mine);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should save presets, replacing those with the same ID, and remove them", async () => {
    const store = fakeStore();
    const custom = new CustomPresets(store);
    await custom.save(mine, theirs);
    const renamed = { ...mine, name: "Softer" };
    await custom.save(renamed);
    expect(custom.presets).toEqual([renamed, theirs]);
    expect(store.put).toHaveBeenLastCalledWith(renamed);
    await custom.remove(theirs.id);
    expect(store.remove).toHaveBeenCalledWith(theirs.id);
    expect(custom.presets).toEqual([renamed]);
    const listener = vi.fn();
    custom.addEventListener("change", listener);
    await custom.save();
    expect(listener).not.toHaveBeenCalled();
  });

  it("should use another store, loading its presets in place of the current ones", async () => {
    const custom = new CustomPresets(fakeStore([mine]));
    await custom.load();
    const other = fakeStore([theirs]);
    const listener = vi.fn();
    custom.addEventListener("change", listener);
    await custom.useStore(other);
    expect(custom.presets).toEqual([theirs]);
    expect(listener).toHaveBeenCalledTimes(2);
    await custom.save(mine);
    expect(other.put).toHaveBeenCalledWith(mine);
    await custom.useStore(undefined);
    expect(custom.presets).toEqual([]);
  });

  it("should ignore presets loaded from a store no longer used", async () => {
    let finish: (presets: unknown[]) => void = () => undefined;
    const slow = fakeStore();
    slow.list.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const custom = new CustomPresets(slow);
    const loading = custom.load();
    await custom.useStore(fakeStore([theirs]));
    finish([mine]);
    await loading;
    expect(custom.presets).toEqual([theirs]);
  });

  it("should find the user's own presets by name, ignoring case and other authors", async () => {
    const custom = new CustomPresets();
    await custom.save(theirs, mine);
    expect(custom.findOwn(" soft ", me)).toBe(mine);
    expect(custom.findOwn("Hard", me)).toBeUndefined();
  });

  it("should find presets by the unknown author without a handle as the own presets of a user without a handle", async () => {
    const custom = new CustomPresets();
    const unknown = { id: "3", name: "Soft", author: { name: "Unknown" } };
    await custom.save(mine, unknown);
    expect(custom.findOwn("soft", "")).toBe(unknown);
    expect(custom.findOwn("soft", "", "Anonymous")).toBeUndefined();
  });

  it("should keep presets in memory without a store", async () => {
    const custom = new CustomPresets();
    await custom.load();
    await custom.save(mine);
    await custom.remove(mine.id);
    expect(custom.presets).toEqual([]);
  });
});
