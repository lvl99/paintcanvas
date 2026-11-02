import { describe, it, expect, vi } from "vitest";
import BrushTipCache from "..";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";

describe("BrushTipCache", () => {
  it("should use the round tip for presets without an image", () => {
    const cache = new BrushTipCache();
    expect(cache.get({ id: "round" }).isRound).toBe(true);
  });

  it("should use the round tip while loading, then the loaded tip, and notify", async () => {
    const { factory } = createRecordingCanvasFactory();
    const decode = vi.fn(async () => ({ width: 2, height: 2 }) as never);
    const cache = new BrushTipCache(decode, factory);
    const listener = vi.fn();
    cache.addEventListener("change", listener);
    const preset = { id: "img", image: "data:image/png;base64,AAAA" };
    const loading = cache.get(preset);
    cache.get(preset);
    expect(loading.isRound).toBe(true);
    expect(decode).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(cache.get(preset).isRound).toBe(false);
  });

  it("should keep the round tip if an image cannot be decoded", async () => {
    const decode = vi.fn(async () => {
      throw new Error("bad image");
    });
    const cache = new BrushTipCache(decode);
    const preset = { id: "bad", image: "data:image/png;base64,AAAA" };
    cache.get(preset);
    await vi.waitFor(() => expect(decode).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.get(preset).isRound).toBe(true);
    expect(decode).toHaveBeenCalledOnce();
  });

  it("should preload every preset's tip", () => {
    const decode = vi.fn(async () => ({ width: 2, height: 2 }) as never);
    const cache = new BrushTipCache(
      decode,
      createRecordingCanvasFactory().factory,
    );
    cache.preload({
      a: { id: "a", image: "data:a" },
      b: { id: "b" },
      c: { id: "c", image: "data:c" },
    });
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("should share a tip between presets with the same shape, and load a changed shape", async () => {
    const { factory } = createRecordingCanvasFactory();
    const decode = vi.fn(async () => ({ width: 2, height: 2 }) as never);
    const cache = new BrushTipCache(decode, factory);
    const shape = "data:image/png;base64,AAAA";
    cache.get({ id: "a", image: shape });
    cache.get({ id: "b", image: shape });
    expect(decode).toHaveBeenCalledOnce();
    cache.get({ id: "a", image: "data:image/png;base64,BBBB" });
    expect(decode).toHaveBeenCalledTimes(2);
    // Shapes given as bytes are kept by preset ID
    const bytes = new Uint8Array([1]);
    cache.get({ id: "c", image: bytes });
    cache.get({ id: "c", image: bytes });
    expect(decode).toHaveBeenCalledTimes(3);
  });
});
