import { describe, it, expect, vi } from "vitest";
import Transformer, {
  applyMask,
  contentBounds,
  copyArea,
  drawTransformed,
} from "..";
import Layer from "../../../classes/Layer";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";
import { createRecordingContext } from "../../../../testing/recordingContext";

/** RGBA data for a width×height image with the listed pixels opaque */
const pixels = (width: number, height: number, opaque: [number, number][]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
  return data;
};

describe("contentBounds", () => {
  it("should find the bounding box of visible pixels", () => {
    expect(
      contentBounds(
        pixels(5, 5, [
          [1, 2],
          [3, 1],
        ]),
        5,
        5,
      ),
    ).toEqual({ x: 1, y: 1, width: 3, height: 2 });
    expect(contentBounds(pixels(5, 5, []), 5, 5)).toBeUndefined();
  });

  it("should only count pixels inside the mask", () => {
    const image = pixels(5, 5, [
      [0, 0],
      [4, 4],
    ]);
    expect(contentBounds(image, 5, 5, pixels(5, 5, [[4, 4]]))).toEqual({
      x: 4,
      y: 4,
      width: 1,
      height: 1,
    });
  });
});

describe("drawTransformed", () => {
  it("should translate, rotate, flip and draw the image centred in the box", () => {
    const { ctx, calls } = createRecordingContext();
    const image = {} as CanvasImageSource;
    drawTransformed(ctx as never, image, {
      cx: 10,
      cy: 20,
      width: -8,
      height: 4,
      rotation: 90,
    });
    expect(calls).toEqual([
      ["save"],
      ["set:imageSmoothingEnabled", true],
      ["set:imageSmoothingQuality", "high"],
      ["translate", 10, 20],
      ["rotate", Math.PI / 2],
      ["scale", -1, 1],
      ["drawImage", image, -4, -2, 8, 4],
      ["restore"],
    ]);
    calls.length = 0;
    drawTransformed(ctx as never, image, {
      cx: 0,
      cy: 0,
      width: 2,
      height: -2,
      rotation: 0,
    });
    expect(calls).toContainEqual(["scale", 1, -1]);
    expect(calls.some(([name]) => name === "rotate")).toBe(false);
  });
});

/** Drawing calls, without property changes (such as test helpers set on a context) */
const drawn = (calls: unknown[][]) =>
  calls.filter(([name]) => !String(name).startsWith("set:"));

describe("copyArea and applyMask", () => {
  it("should copy an area into a canvas its size, and cut it to a mask piece", () => {
    const { factory, created } = createRecordingCanvasFactory();
    const image = {} as CanvasImageSource;
    const copy = copyArea(factory, image, { x: 1, y: 2, width: 3, height: 4 });
    expect(copy).toMatchObject({ width: 3, height: 4 });
    const maskPiece = {} as OffscreenCanvas;
    applyMask(copy, maskPiece);
    expect(created[0]!.calls).toEqual([
      ["drawImage", image, 1, 2, 3, 4, 0, 0, 3, 4],
      ["set:globalCompositeOperation", "destination-in"],
      ["drawImage", maskPiece, 0, 0],
      ["set:globalCompositeOperation", "source-over"],
    ]);
  });
});

describe("Transformer", () => {
  /** A transformer and layer whose layer reports the given opaque pixels */
  const setup = (opaque: [number, number][]) => {
    const { factory, created } = createRecordingCanvasFactory();
    const layer = new Layer({ name: "L" }, 10, 10, factory);
    const data = pixels(10, 10, opaque);
    (layer.context as unknown as Record<string, unknown>).getImageData =
      () => ({ data });
    const transformer = new Transformer(10, 10, factory);
    return { transformer, layer, created };
  };

  it("should show nothing for an empty layer", () => {
    const { transformer, layer } = setup([]);
    const listener = vi.fn();
    transformer.addEventListener("change", listener);
    transformer.prepare(layer);
    expect(transformer.active).toBe(false);
    expect(transformer.aspect).toBe(1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should box the layer's pixels, lift them on the first change and preview them", () => {
    const { transformer, layer, created } = setup([
      [2, 2],
      [5, 3],
    ]);
    transformer.prepare(layer);
    expect(transformer.box).toEqual({
      cx: 4,
      cy: 3,
      width: 4,
      height: 2,
      rotation: 0,
    });
    expect(transformer.aspect).toBe(2);
    expect(transformer.preview).toBeUndefined();
    transformer.setBox({ ...transformer.box!, cx: 6 });
    expect(transformer.pending).toBe(true);
    // The layer gets a hole where the pixels were
    expect(created[0]!.calls).toContainEqual(["clearRect", 2, 2, 4, 2]);
    expect(transformer.preview?.layer).toBe(layer);
  });

  it("should write the transformed pixels on commit and report what moved", () => {
    const { transformer, layer, created } = setup([[2, 2]]);
    transformer.prepare(layer);
    transformer.setBox({ ...transformer.box!, cx: 7 });
    const result = transformer.commit();
    expect(result).toMatchObject({
      source: { x: 2, y: 2, width: 1, height: 1 },
      box: { cx: 7 },
    });
    expect(result?.maskPiece).toBeUndefined();
    expect(created[0]!.calls).toContainEqual(["translate", 7, 2.5]);
    expect(transformer.active).toBe(false);
    // The changed area covers where the pixels were and where they went, with a copy of the original pixels
    expect(result?.area).toEqual({ x: 2, y: 2, width: 6, height: 1 });
    expect(result?.before).toMatchObject({ width: 6, height: 1 });
    const before = created.find(({ canvas }) => canvas === result?.before)!;
    expect(before.calls).toEqual([
      ["drawImage", layer.canvas, 2, 2, 6, 1, 0, 0, 6, 1],
      ["clearRect", 0, 0, 1, 1],
      ["drawImage", expect.anything(), 0, 0],
    ]);
  });

  it("should float pasted pixels over a layer until they are committed", () => {
    const { transformer, layer, created } = setup([[2, 2]]);
    const image = {} as OffscreenCanvas;
    const listener = vi.fn();
    transformer.addEventListener("change", listener);
    transformer.float(layer, image, { x: 1, y: 1, width: 2, height: 2 });
    expect(listener).toHaveBeenCalledOnce();
    expect(transformer.pending).toBe(true);
    expect(transformer.pasting).toBe(true);
    expect(transformer.box).toMatchObject({
      cx: 2,
      cy: 2,
      width: 2,
      height: 2,
    });
    expect(transformer.preview?.layer).toBe(layer);
    // Nothing is lifted off the layer
    expect(drawn(created[0]!.calls)).toEqual([]);
    transformer.setBox({ ...transformer.box!, cx: 6 });
    const result = transformer.commit();
    // Only where the pixels went changes, and the copy is the layer's pixels there
    expect(result?.area).toEqual({ x: 5, y: 1, width: 2, height: 2 });
    const before = created.find(({ canvas }) => canvas === result?.before)!;
    expect(before.calls).toEqual([
      ["drawImage", layer.canvas, 5, 1, 2, 2, 0, 0, 2, 2],
    ]);
    expect(created[0]!.calls).toContainEqual([
      "drawImage",
      image,
      -1,
      -1,
      2,
      2,
    ]);
    expect(transformer.pasting).toBe(false);
  });

  it("should discard pasted pixels on cancel, and commit nothing when they are off the canvas", () => {
    const { transformer, layer, created } = setup([[2, 2]]);
    transformer.float(layer, {} as OffscreenCanvas, {
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });
    transformer.cancel();
    expect(transformer.active).toBe(false);
    expect(transformer.pending).toBe(false);
    transformer.float(layer, {} as OffscreenCanvas, {
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });
    transformer.setBox({ ...transformer.box!, cx: 50 });
    expect(transformer.commit()).toBeUndefined();
    expect(transformer.active).toBe(false);
    expect(drawn(created[0]!.calls)).toEqual([]);
  });

  it("should commit nothing when nothing changed", () => {
    const { transformer, layer } = setup([[2, 2]]);
    transformer.prepare(layer);
    expect(transformer.commit()).toBeUndefined();
    expect(transformer.active).toBe(false);
  });

  it("should put the original pixels back on cancel", () => {
    const { transformer, layer, created } = setup([[2, 2]]);
    transformer.prepare(layer);
    transformer.cancel();
    transformer.setBox({ ...transformer.box!, cx: 7 });
    transformer.cancel();
    expect(transformer.pending).toBe(false);
    expect(transformer.box).toEqual({
      cx: 2.5,
      cy: 2.5,
      width: 1,
      height: 1,
      rotation: 0,
    });
    expect(created[0]!.calls).toContainEqual([
      "drawImage",
      expect.anything(),
      2,
      2,
    ]);
  });

  it("should lift only the masked pixels and return the mask piece", () => {
    const { factory } = createRecordingCanvasFactory();
    const { transformer, layer, created } = setup([[2, 2]]);
    const mask = factory(10, 10);
    const maskData = pixels(10, 10, [[2, 2]]);
    (mask.getContext("2d") as unknown as Record<string, unknown>).getImageData =
      () => ({ data: maskData });
    transformer.prepare(layer, mask);
    transformer.setBox({ ...transformer.box!, cx: 7 });
    expect(created[0]!.calls).toContainEqual([
      "set:globalCompositeOperation",
      "destination-out",
    ]);
    expect(transformer.commit()?.maskPiece).toBeDefined();
  });

  it("should ignore changes before anything is prepared", () => {
    const { transformer } = setup([]);
    transformer.setBox({ cx: 0, cy: 0, width: 1, height: 1, rotation: 0 });
    expect(transformer.pending).toBe(false);
  });

  it("should create real canvases by default", () => {
    expect(new Transformer(1, 1).active).toBe(false);
  });
});
