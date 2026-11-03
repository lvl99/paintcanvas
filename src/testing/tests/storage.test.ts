import { describe, it, expect } from "vitest";
import { MemoryLayerStore } from "../layerStore";
import { createFakeLocks } from "../locks";
import { SAVED_DRAWING_VERSION } from "../../lib/storage";
import { BlendMode } from "../../lib/classes/Layer";

describe("MemoryLayerStore", () => {
  it("should keep the drawing and the images of its layers, until cleared", async () => {
    const store = new MemoryLayerStore();
    expect(store.name).toBe("test");
    const layer = (id: string) => ({
      id,
      name: id,
      blendMode: BlendMode.Normal,
      opacity: 1,
      visible: true,
      alphaLock: false,
    });
    const drawing = (...ids: string[]) => ({
      version: SAVED_DRAWING_VERSION,
      width: 1,
      height: 1,
      layers: ids.map(layer),
      activeLayer: ids[0] as string,
    });
    const a = new Blob(["a"]);
    const b = new Blob(["b"]);
    await store.save(
      drawing("a", "b"),
      new Map([
        ["a", a],
        ["b", b],
      ]),
    );
    await store.save(drawing("a"), new Map());
    expect([...((await store.load())?.images ?? [])]).toEqual([["a", a]]);
    expect(store.saves).toHaveLength(2);
    await store.clear();
    expect(await store.load()).toBeUndefined();
  });
});

describe("createFakeLocks", () => {
  it("should keep a stolen lock with its new holder when the old one lets go", async () => {
    const { locks, isHeld } = createFakeLocks();
    let releaseFirst!: () => void;
    const first = locks.request("drawing", {}, () => {
      return new Promise<void>((resolve) => (releaseFirst = resolve));
    });
    const stolen = expect(first).rejects.toThrow("stolen");
    let releaseSecond!: () => void;
    const second = locks.request("drawing", { steal: true }, () => {
      return new Promise<void>((resolve) => (releaseSecond = resolve));
    });
    await stolen;
    releaseFirst();
    await Promise.resolve();
    expect(isHeld("drawing")).toBe(true);
    releaseSecond();
    await second;
    expect(isHeld("drawing")).toBe(false);
  });
});
