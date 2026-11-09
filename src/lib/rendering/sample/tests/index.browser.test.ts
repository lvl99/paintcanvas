import { describe, it, expect, vi } from "vitest";
import { copyPixels, flattenArea, readPixels } from "..";
import { BlendMode, createOffscreenCanvas } from "../../../classes/Layer";
import type { DrawableLayer } from "../../compositing";

/** A layer filled with a colour, mixed as given */
const layer = (
  colour: string,
  options: { opacity?: number; blendMode?: DrawableLayer["blendMode"] } = {},
): DrawableLayer => {
  const canvas = createOffscreenCanvas(20, 20);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 10, 20);
  return {
    canvas,
    visible: true,
    opacity: options.opacity ?? 1,
    blendMode: options.blendMode ?? BlendMode.Normal,
  };
};

describe("copyPixels", () => {
  it("should copy an area of a canvas onto a canvas its size", () => {
    const piece = copyPixels(
      layer("#ff0000").canvas,
      { x: 9, y: 5, width: 2, height: 1 },
      createOffscreenCanvas,
    );
    expect([piece.width, piece.height]).toEqual([2, 1]);
    expect([...readPixels(piece)]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
  });
});

describe("flattenArea", () => {
  it("should draw an area as shown: white background, every layer mixed, transparent outside the canvas", () => {
    // The top layer (index 0) multiplies over the bottom one, at half opacity
    const layers = [
      layer("#ff0000", { opacity: 0.5, blendMode: BlendMode.Multiply }),
      layer("#00ff00"),
    ];
    const flat = flattenArea(layers, createOffscreenCanvas, 20, 20, {
      x: 8,
      y: 0,
      width: 14,
      height: 1,
    });
    const pixels = readPixels(flat);
    const at = (x: number) => [...pixels.slice(x * 4, x * 4 + 4)];
    // Green, half multiplied by red: (0, about 128, 0)
    const [r, g, b, a] = at(0) as [number, number, number, number];
    expect([r, b, a]).toEqual([0, 0, 255]);
    expect(Math.abs(g - 128)).toBeLessThanOrEqual(1);
    // No layers drawn there: the white background
    expect(at(5)).toEqual([255, 255, 255, 255]);
    // Outside the canvas
    expect(at(13)).toEqual([0, 0, 0, 0]);
  });

  it("should scale an area down to fit, averaging as it goes", () => {
    const flat = flattenArea(
      [layer("#000000")],
      createOffscreenCanvas,
      20,
      20,
      { x: 0, y: 0, width: 20, height: 20 },
      2,
      2,
    );
    expect([flat.width, flat.height]).toEqual([2, 2]);
    const pixels = readPixels(flat);
    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...pixels.slice(4, 8)]).toEqual([255, 255, 255, 255]);
  });

  it("should read only the area's pixels from the shown layers, cut to the canvas", () => {
    const shown = layer("#ff0000");
    const hidden = { ...layer("#00ff00"), visible: false };
    const clear = { ...layer("#0000ff"), opacity: 0 };
    const read = (item: DrawableLayer) =>
      vi.spyOn(
        item.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D,
        "getImageData",
      );
    const [shownRead, hiddenRead, clearRead] = [shown, hidden, clear].map(read);
    const flat = flattenArea(
      [shown, hidden, clear],
      createOffscreenCanvas,
      20,
      20,
      { x: 18, y: -1, width: 4, height: 2 },
    );
    expect(shownRead).toHaveBeenCalledExactlyOnceWith(18, 0, 2, 1);
    expect(hiddenRead).not.toHaveBeenCalled();
    expect(clearRead).not.toHaveBeenCalled();
    const pixels = [...readPixels(flat)];
    // Above the canvas, then the white background where nothing's drawn, then right of the canvas
    expect(pixels.slice(0, 16)).toEqual(Array(16).fill(0));
    expect(pixels.slice(16, 24)).toEqual(Array(8).fill(255));
    expect(pixels.slice(24)).toEqual(Array(8).fill(0));
  });

  it("should leave an area outside the canvas transparent", () => {
    const flat = flattenArea(
      [layer("#ff0000")],
      createOffscreenCanvas,
      20,
      20,
      {
        x: 30,
        y: 30,
        width: 2,
        height: 2,
      },
    );
    expect([...readPixels(flat)]).toEqual(Array(16).fill(0));
  });
});
