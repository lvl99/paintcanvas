import { describe, it, expect } from "vitest";
import { flattenArea, readPixels } from "..";
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
});
