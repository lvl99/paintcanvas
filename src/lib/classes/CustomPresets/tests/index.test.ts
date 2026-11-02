import { describe, it, expect, vi } from "vitest";
import CustomPresets, { type PresetStoreLike } from "..";
import type { BrushConfig } from "../../../brushes/types";

const owner = "owner-1";
const me = "me.example";

/** A store kept in memory */
const fakeStore = (saved: BrushConfig[] = []) =>
  ({
    list: vi.fn(async () => saved),
    put: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  }) satisfies PresetStoreLike;

const mine = { id: "1", name: "Soft", author: { name: "Me", handle: me } };
const theirs = {
  id: "2",
  name: "Soft",
  author: { name: "Ann", handle: "ann.test" },
};

describe("CustomPresets", () => {
  it("should load the user's presets from the store and notify", async () => {
    const store = fakeStore([mine]);
    const custom = new CustomPresets(owner, store);
    const listener = vi.fn();
    custom.addEventListener("change", listener);
    await custom.load();
    expect(store.list).toHaveBeenCalledWith(owner);
    expect(custom.presets).toEqual([mine]);
    expect(custom.get("1")).toBe(mine);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should save presets, replacing those with the same ID, and remove them", async () => {
    const store = fakeStore();
    const custom = new CustomPresets(owner, store);
    await custom.save(mine, theirs);
    const renamed = { ...mine, name: "Softer" };
    await custom.save(renamed);
    expect(custom.presets).toEqual([renamed, theirs]);
    expect(store.put).toHaveBeenLastCalledWith(owner, renamed);
    await custom.remove("2");
    expect(store.remove).toHaveBeenCalledWith(owner, "2");
    expect(custom.presets).toEqual([renamed]);
    const listener = vi.fn();
    custom.addEventListener("change", listener);
    await custom.save();
    expect(listener).not.toHaveBeenCalled();
  });

  it("should find the user's own presets by name, ignoring case and other authors", async () => {
    const custom = new CustomPresets(owner);
    await custom.save(theirs, mine);
    expect(custom.findOwn(" soft ", me)).toBe(mine);
    expect(custom.findOwn("Hard", me)).toBeUndefined();
  });

  it("should find presets by the unknown author without a handle as the own presets of a user without a handle", async () => {
    const custom = new CustomPresets(owner);
    const unknown = { id: "3", name: "Soft", author: { name: "Unknown" } };
    await custom.save(mine, unknown);
    expect(custom.findOwn("soft", "")).toBe(unknown);
    expect(custom.findOwn("soft", "", "Anonymous")).toBeUndefined();
  });

  it("should keep presets in memory without a store", async () => {
    const custom = new CustomPresets(owner);
    await custom.load();
    await custom.save(mine);
    await custom.remove("1");
    expect(custom.presets).toEqual([]);
  });
});
