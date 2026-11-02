// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bytesToBase64,
  encodeRgbaDeflate,
  ImageEncoding,
  type BoundingBox,
} from "../../../image";
import { createPatchMessage } from "../../../messages";
import ExternalSheets from "..";

/** A fake canvas whose context records drawing calls */
const createCanvas = vi.fn((width: number, height: number) => {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
  };
  return {
    width,
    height,
    getContext: () => context,
  } as unknown as OffscreenCanvas;
});

/** The fake context of a sheet's canvas */
const contextOf = (canvas: OffscreenCanvas) =>
  canvas.getContext("2d") as unknown as {
    clearRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    putImageData: ReturnType<typeof vi.fn>;
  };

/** Minimal ImageData (jsdom has none) */
class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
  createCanvas.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

/** An rgba-deflate image message of solid pixels */
const rgbaMessage = async (coords: BoundingBox) => {
  const [x1, y1, x2, y2] = coords;
  const rgba = new Uint8ClampedArray((x2 - x1) * (y2 - y1) * 4).fill(255);
  return createPatchMessage(
    coords,
    ImageEncoding.RgbaDeflate,
    await encodeRgbaDeflate(rgba, coords),
  );
};

describe("ExternalSheets", () => {
  it("should draw each person's pixels on their own sheet, newest on top", async () => {
    const remote = new ExternalSheets(100, 50, createCanvas);
    const onChange = vi.fn();
    remote.addEventListener("change", onChange);
    await remote.apply("ann", await rgbaMessage([10, 20, 12, 21]));
    await remote.apply("bob", await rgbaMessage([0, 0, 1, 1]));
    await remote.apply("ann", await rgbaMessage([0, 0, 1, 1]));
    expect(remote.sheets.map((sheet) => sheet.source)).toEqual(["bob", "ann"]);
    expect(createCanvas).toHaveBeenCalledTimes(2);
    expect(createCanvas).toHaveBeenCalledWith(100, 50);
    const ann = remote.sheets[1]!;
    expect(ann).toMatchObject({
      visible: true,
      opacity: 1,
      blendMode: "source-over",
    });
    const [[image, x, y]] = contextOf(ann.canvas).putImageData.mock
      .calls as unknown as [[FakeImageData, number, number]];
    expect([image.width, image.height, x, y]).toEqual([2, 1, 10, 20]);
    expect(image.data).toHaveLength(8);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("should draw PNG images in place of what was there", async () => {
    const bitmap = { width: 2, height: 2 } as ImageBitmap;
    const decodePng = vi.fn(async () => bitmap);
    const remote = new ExternalSheets(100, 100, createCanvas, decodePng);
    const bytes = new Uint8Array([1, 2, 3]);
    await remote.apply(
      "ann",
      createPatchMessage([5, 6, 7, 8], ImageEncoding.Png, bytesToBase64(bytes)),
    );
    expect(decodePng).toHaveBeenCalledWith(bytes);
    const context = contextOf(remote.sheets[0]!.canvas);
    expect(context.clearRect).toHaveBeenCalledWith(5, 6, 2, 2);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 5, 6);
  });

  it("should decode PNGs with the browser by default", async () => {
    const bitmap = { width: 1, height: 1 };
    const createImageBitmap = vi.fn(async (blob: Blob) => {
      expect(blob.type).toBe("image/png");
      return bitmap;
    });
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const remote = new ExternalSheets(10, 10, createCanvas);
    await remote.apply(
      "ann",
      createPatchMessage(
        [0, 0, 1, 1],
        ImageEncoding.Png,
        bytesToBase64(new Uint8Array([1])),
      ),
    );
    expect(createImageBitmap).toHaveBeenCalled();
    expect(contextOf(remote.sheets[0]!.canvas).drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      0,
    );
  });

  it("should skip images it can't decode, and keep applying later ones", async () => {
    const remote = new ExternalSheets(10, 10, createCanvas);
    const onChange = vi.fn();
    remote.addEventListener("change", onChange);
    await remote.apply(
      "ann",
      createPatchMessage(
        [0, 0, 1, 1],
        ImageEncoding.RgbaDeflate,
        "bm90IGRlZmxhdGU=",
      ),
    );
    await remote.apply("ann", await rgbaMessage([0, 0, 1, 1]));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("should remove everyone's drawings when cleared or resized", async () => {
    const remote = new ExternalSheets(10, 10, createCanvas);
    const onChange = vi.fn();
    await remote.apply("ann", await rgbaMessage([0, 0, 1, 1]));
    remote.addEventListener("change", onChange);
    remote.clear();
    expect(remote.sheets).toEqual([]);
    await remote.apply("ann", await rgbaMessage([0, 0, 1, 1]));
    remote.resize(30, 40);
    expect(remote.sheets).toEqual([]);
    await remote.apply("ann", await rgbaMessage([0, 0, 1, 1]));
    expect(createCanvas).toHaveBeenLastCalledWith(30, 40);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("should restore a saved drawing onto a source's sheet", async () => {
    const remote = new ExternalSheets(10, 20, createCanvas);
    const onChange = vi.fn();
    remote.addEventListener("change", onChange);
    const image = { width: 10, height: 20 } as unknown as ImageBitmap;
    remote.restore("others", image);
    const [sheet] = remote.sheets;
    expect(sheet?.source).toBe("others");
    const context = contextOf(sheet!.canvas);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 10, 20);
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("should create offscreen canvases by default", () => {
    expect(() => new ExternalSheets(10, 10)).not.toThrow();
  });

  it("should paint onto a source's sheet in order, skipping drawings that throw", async () => {
    const remote = new ExternalSheets(10, 10, createCanvas);
    const onChange = vi.fn();
    remote.addEventListener("change", onChange);
    const draw = vi.fn();
    await remote.paint("ann", () => {
      throw new Error("Broken");
    });
    await remote.paint("ann", draw);
    expect(draw).toHaveBeenCalledWith(remote.sheets[0]!.canvas);
    expect(remote.sheets.map((sheet) => sheet.source)).toEqual(["ann"]);
    expect(onChange).toHaveBeenCalledOnce();
  });
});
