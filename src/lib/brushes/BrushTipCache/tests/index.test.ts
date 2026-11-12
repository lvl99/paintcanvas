import { describe, it, expect, vi } from "vitest";
import BrushTipCache from "..";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";
import { testPreset } from "../../../../testing/assets";

describe("BrushTipCache", () => {
  it("should use the round tip for presets without an image", () => {
    const cache = new BrushTipCache();
    expect(cache.get({}).isRound).toBe(true);
  });

  it("should use the round tip while loading, then the loaded tip, and notify", async () => {
    const { factory } = createRecordingCanvasFactory();
    const decode = vi.fn(async () => ({ width: 2, height: 2 }) as never);
    const cache = new BrushTipCache(decode, factory);
    const listener = vi.fn();
    cache.addEventListener("change", listener);
    const preset = { image: "data:image/png;base64,AAAA" };
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
    const preset = { image: "data:image/png;base64,AAAA" };
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
      a: testPreset({ image: "data:a" }),
      b: testPreset(),
      c: testPreset({ image: "data:c" }),
    });
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("should share a tip between presets with the same shape, and load a changed shape", async () => {
    const { factory } = createRecordingCanvasFactory();
    const decode = vi.fn(async () => ({ width: 2, height: 2 }) as never);
    const cache = new BrushTipCache(decode, factory);
    const shape = "data:image/png;base64,AAAA";
    cache.get({ image: shape });
    cache.get({ image: shape });
    expect(decode).toHaveBeenCalledOnce();
    cache.get({ image: "data:image/png;base64,BBBB" });
    expect(decode).toHaveBeenCalledTimes(2);
    // Shapes given as bytes are kept by the bytes given
    const bytes = new Uint8Array([1]);
    cache.get({ image: bytes });
    cache.get({ image: bytes });
    expect(decode).toHaveBeenCalledTimes(3);
    cache.get({ image: new Uint8Array([1]) });
    expect(decode).toHaveBeenCalledTimes(4);
  });
});
