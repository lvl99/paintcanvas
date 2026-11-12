import { describe, it, expect, vi, afterEach } from "vitest";
import BrushTip, { dataUrlBytes, decodeImage } from "..";
import {
  createRecordingContext,
  type Recorded,
} from "../../../../testing/recordingContext";
import type { StampParams } from "../../../brushes/params";

const params: StampParams = {
  width: 20,
  height: 10,
  rotation: 90,
  offsetX: 1,
  offsetY: 2,
  alpha: 0.5,
};

/** Canvas factory whose contexts record calls; 2×2 image pixels come from `alpha` */
const createRecordingCanvases = (alpha: number[] = [255, 0, 0, 255]) => {
  const contexts: Recorded[][] = [];
  const factory = (width: number, height: number) => {
    const recording = createRecordingContext();
    contexts.push(recording.calls);
    const ctx = recording.ctx as unknown as Record<string, unknown>;
    ctx.getImageData = () => ({
      data: Uint8ClampedArray.from(alpha.flatMap((a) => [0, 0, 0, a])),
    });
    return {
      width,
      height,
      getContext: () => ctx,
    } as unknown as OffscreenCanvas;
  };
  return { factory, contexts };
};

afterEach(() => vi.unstubAllGlobals());

describe("BrushTip", () => {
  it("should use a crisp round shape when the preset has no image", async () => {
    const tip = await BrushTip.load({});
    expect(tip.isRound).toBe(true);
    expect(tip.outline).toBeUndefined();
    const { ctx, calls } = createRecordingContext();
    tip.stamp(ctx as never, 10, 20, params, "#ff0000");
    expect(calls).toEqual([
      ["save"],
      ["set:globalAlpha", 0.5],
      ["translate", 11, 22],
      ["rotate", Math.PI / 2],
      ["set:fillStyle", "#ff0000"],
      ["beginPath"],
      ["ellipse", 0, 0, 10, 5, 0, 0, Math.PI * 2],
      ["fill"],
      ["restore"],
    ]);
  });

  it("should skip rotation when there is none, and skip invisible stamps", async () => {
    const tip = await BrushTip.load({});
    const { ctx, calls } = createRecordingContext();
    tip.stamp(ctx as never, 0, 0, { ...params, rotation: 0 }, "#000");
    expect(calls.some(([name]) => name === "rotate")).toBe(false);
    calls.length = 0;
    tip.stamp(ctx as never, 0, 0, { ...params, width: 0 }, "#000");
    tip.stamp(ctx as never, 0, 0, { ...params, height: 0 }, "#000");
    tip.stamp(ctx as never, 0, 0, { ...params, alpha: 0 }, "#000");
    expect(calls).toEqual([]);
  });

  it("should load an image shape as an alpha mask with an outline", async () => {
    const { factory, contexts } = createRecordingCanvases();
    const image = { width: 2, height: 2 } as never;
    const decode = vi.fn(async () => image);
    const tip = await BrushTip.load(
      { image: "data:image/png;base64,AAAA" },
      decode,
      factory,
    );
    expect(decode).toHaveBeenCalledWith("data:image/png;base64,AAAA");
    expect(tip.isRound).toBe(false);
    expect(tip.outline!.length).toBeGreaterThan(0);
    expect(contexts[0]).toEqual(
      expect.arrayContaining([
        ["drawImage", image, 0, 0],
        ["set:globalCompositeOperation", "source-in"],
        ["fillRect", 0, 0, 2, 2],
      ]),
    );
  });

  it("should stamp image shapes tinted with the colour, re-tinting only when the colour changes", async () => {
    const { factory, contexts } = createRecordingCanvases();
    const tip = await BrushTip.load(
      { image: new Uint8Array([1]) },
      async () => ({ width: 2, height: 2 }) as never,
      factory,
    );
    const { ctx, calls } = createRecordingContext();
    tip.stamp(ctx as never, 5, 5, params, "#00ff00");
    tip.stamp(ctx as never, 6, 6, params, "#00ff00");
    expect(contexts).toHaveLength(2);
    expect(contexts[1]).toContainEqual(["set:fillStyle", "#00ff00"]);
    const tintCalls = contexts[1]!.length;
    tip.stamp(ctx as never, 7, 7, params, "#0000ff");
    expect(contexts).toHaveLength(2);
    expect(contexts[1]!.length).toBeGreaterThan(tintCalls);
    expect(calls.filter(([name]) => name === "drawImage")).toHaveLength(3);
    expect(calls).toContainEqual([
      "drawImage",
      expect.anything(),
      -10,
      -5,
      20,
      10,
    ]);
  });
});

describe("dataUrlBytes", () => {
  it("should read base64 and plain data URLs", () => {
    /** A data URL's type and bytes, as plain values */
    const read = (url: string) => {
      const { type, bytes } = dataUrlBytes(url);
      return [type, [...bytes]];
    };
    expect(read("data:image/png;base64,iVBORw==")).toEqual([
      "image/png",
      [137, 80, 78, 71],
    ]);
    expect(read("data:text/plain,a%20b")).toEqual(["text/plain", [97, 32, 98]]);
    expect(read("data:,")).toEqual(["", []]);
  });

  it("should refuse anything that isn't a data URL", () => {
    expect(() => dataUrlBytes("https://example.com/a.png")).toThrow(
      "Brush shapes must be data URLs",
    );
  });
});

describe("decodeImage", () => {
  it("should decode data URLs and bytes with the browser's image decoder, without fetch", async () => {
    const bitmap = { width: 1, height: 1 };
    const createImageBitmap = vi.fn<(blob: Blob) => Promise<typeof bitmap>>(
      async () => bitmap,
    );
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await decodeImage("data:image/png;base64,iVBORw==")).toBe(bitmap);
    const blob = createImageBitmap.mock.calls[0]![0];
    expect(blob.type).toBe("image/png");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([
      137, 80, 78, 71,
    ]);
    expect(await decodeImage(new Uint8Array([1, 2]))).toBe(bitmap);
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });
});
