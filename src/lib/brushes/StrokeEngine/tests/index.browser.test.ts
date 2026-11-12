import { describe, it, expect } from "vitest";
import StrokeEngine, { type StrokeOptions } from "..";
import Layer from "../../../classes/Layer";
import BrushTip from "../../../rendering/BrushTip";
import { SmoothingType } from "../../types";

/** Read one pixel of a layer as [r, g, b, a] */
const pixel = (layer: Layer, x: number, y: number) => [
  ...layer.context.getImageData(x, y, 1, 1).data,
];

/** Draw one stroke through the given points (10 ms apart) */
const stroke = (
  engine: StrokeEngine,
  options: StrokeOptions,
  points: [number, number][],
) => {
  const [first, ...rest] = points;
  engine.begin(options, { x: first![0], y: first![1] }, 0);
  rest.forEach(([x, y], i) => engine.move({ x, y }, (i + 1) * 10));
  const [x, y] = points.at(-1)!;
  engine.end({ x, y }, points.length * 10);
};

/** Options for a round brush on a new 100×100 layer */
const setup = (overrides: Partial<StrokeOptions> = {}) => {
  const layer = new Layer({ name: "L" }, 100, 100);
  const options: StrokeOptions = {
    layer,
    mode: "paint",
    preset: {
      spacing: 1,
      sampleRate: 10,
      smoothingType: SmoothingType.Linear,
    },
    size: { width: 10, height: 10 },
    colour: "#ff0000",
    tip: new BrushTip(),
    isPen: false,
    ...overrides,
  };
  return { engine: new StrokeEngine(100, 100), layer, options };
};

/** A square brush shape: a 2×2 opaque mask */
const squareTip = () => {
  const mask = new OffscreenCanvas(2, 2);
  const ctx = mask.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.fillRect(0, 0, 2, 2);
  return new BrushTip(mask);
};

describe("strokes in a real browser", () => {
  it("should paint the stroke in the current colour along its line", () => {
    const { engine, layer, options } = setup();
    stroke(engine, options, [
      [20, 50],
      [80, 50],
    ]);
    expect(pixel(layer, 20, 50)).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 50, 50)).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 50, 60)[3]).toBe(0);
  });

  it("should apply the stroke opacity once, without overlapping stamps building up", () => {
    const { engine, layer, options } = setup({
      preset: { spacing: 1, alpha: 0.5 },
    });
    // Dense overlapping stamps, crossing back over itself
    stroke(engine, options, [
      [20, 50],
      [80, 50],
      [20, 50],
    ]);
    const [, , , centre] = pixel(layer, 50, 50);
    const [, , , start] = pixel(layer, 22, 50);
    expect(centre).toBeGreaterThanOrEqual(126);
    expect(centre).toBeLessThanOrEqual(129);
    expect(start).toBe(centre);
  });

  it("should build up opacity across separate strokes", () => {
    const { engine, layer, options } = setup({
      preset: { spacing: 1, alpha: 0.5 },
    });
    stroke(engine, options, [[50, 50]]);
    stroke(engine, options, [[50, 50]]);
    expect(pixel(layer, 50, 50)[3]).toBeGreaterThan(180);
  });

  it("should erase exactly the brush shape", () => {
    const { engine, layer, options } = setup();
    layer.context.fillStyle = "#0000ff";
    layer.context.fillRect(0, 0, 100, 100);
    stroke(engine, { ...options, mode: "erase" }, [[50, 50]]);
    expect(pixel(layer, 50, 50)[3]).toBe(0);
    // Just outside the 10 px round tip
    expect(pixel(layer, 50, 57)).toEqual([0, 0, 255, 255]);
    expect(pixel(layer, 57, 50)).toEqual([0, 0, 255, 255]);
  });

  it("should only paint onto existing pixels with alpha lock", () => {
    const { engine, layer, options } = setup();
    layer.context.fillStyle = "#0000ff";
    layer.context.fillRect(0, 0, 50, 100);
    layer.alphaLock = true;
    stroke(engine, options, [
      [30, 50],
      [70, 50],
    ]);
    expect(pixel(layer, 40, 50)).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 60, 50)[3]).toBe(0);
  });

  it("should paint the eraser's colour onto existing pixels with alpha lock on, instead of erasing", () => {
    const { engine, layer, options } = setup();
    layer.context.fillStyle = "#0000ff";
    layer.context.fillRect(0, 0, 50, 100);
    layer.alphaLock = true;
    stroke(engine, { ...options, mode: "erase", colour: "#00ff00" }, [
      [45, 50],
    ]);
    expect(pixel(layer, 45, 50)).toEqual([0, 255, 0, 255]);
    expect(pixel(layer, 52, 50)[3]).toBe(0);
  });

  it("should show the stroke in the preview before it is written to the layer", () => {
    const { engine, layer, options } = setup();
    engine.begin(options, { x: 50, y: 50 }, 0);
    const preview = engine.preview!.image as OffscreenCanvas;
    const previewPixel = [
      ...preview.getContext("2d")!.getImageData(50, 50, 1, 1).data,
    ];
    expect(previewPixel).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 50, 50)[3]).toBe(0);
    engine.cancel();
    expect(pixel(layer, 50, 50)[3]).toBe(0);
  });
});

describe("strokes limited to a mask in a real browser", () => {
  /** Create a 100×100 mask canvas filled in a rectangle with an alpha */
  const createMask = (
    alpha: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const mask = new OffscreenCanvas(100, 100);
    const ctx = mask.getContext("2d")!;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(x, y, width, height);
    return mask;
  };

  it("should only paint inside the mask", () => {
    const { engine, layer, options } = setup({
      mask: createMask(1, 0, 0, 50, 100),
    });
    stroke(engine, options, [
      [20, 50],
      [80, 50],
    ]);
    expect(pixel(layer, 30, 50)).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 70, 50)[3]).toBe(0);
  });

  it("should paint partially where the mask is grey", () => {
    const { engine, layer, options } = setup({
      mask: createMask(0.5, 0, 0, 100, 100),
    });
    stroke(engine, options, [[50, 50]]);
    const [, , , alpha] = pixel(layer, 50, 50);
    expect(alpha).toBeGreaterThanOrEqual(126);
    expect(alpha).toBeLessThanOrEqual(129);
  });

  it("should only erase inside the mask", () => {
    const { engine, layer, options } = setup({
      mode: "erase",
      mask: createMask(1, 0, 0, 50, 100),
    });
    layer.context.fillStyle = "#0000ff";
    layer.context.fillRect(0, 0, 100, 100);
    stroke(engine, options, [
      [20, 50],
      [80, 50],
    ]);
    expect(pixel(layer, 30, 50)[3]).toBe(0);
    expect(pixel(layer, 70, 50)).toEqual([0, 0, 255, 255]);
  });

  it("should show the masked stroke in the preview", () => {
    const { engine, options } = setup({ mask: createMask(1, 0, 0, 50, 100) });
    engine.begin(options, { x: 50, y: 50 }, 0);
    const preview = (engine.preview!.image as OffscreenCanvas).getContext(
      "2d",
    )!;
    expect(preview.getImageData(48, 50, 1, 1).data[3]).toBe(255);
    expect(preview.getImageData(54, 50, 1, 1).data[3]).toBe(0);
  });
});

describe("strokes snapped to the pixel grid in a real browser", () => {
  it("should paint only the pixel under the pointer with a 1 pixel square", () => {
    const { engine, layer, options } = setup({
      preset: { spacing: 1, snapToPixelGrid: true },
      size: { width: 1, height: 1 },
      tip: squareTip(),
    });
    stroke(engine, options, [[10.7, 20.2]]);
    expect(pixel(layer, 10, 20)).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 11, 20)[3]).toBe(0);
    expect(pixel(layer, 10, 21)[3]).toBe(0);
  });

  it("should paint a whole pixel for a stamp smaller than a pixel, which is faint without snapping", () => {
    const snapped = setup({
      preset: { spacing: 1, snapToPixelGrid: true },
      size: { width: 0.6, height: 0.6 },
      tip: squareTip(),
    });
    stroke(snapped.engine, snapped.options, [[10.2, 20.2]]);
    expect(pixel(snapped.layer, 10, 20)).toEqual([255, 0, 0, 255]);
    const loose = setup({
      preset: { spacing: 1 },
      size: { width: 0.6, height: 0.6 },
      tip: squareTip(),
    });
    stroke(loose.engine, loose.options, [[10.2, 20.2]]);
    expect(pixel(loose.layer, 10, 20)[3]).toBeLessThan(255);
  });

  it("should erase whole pixels with a square that snaps to the pixel grid", () => {
    const { engine, layer, options } = setup({
      preset: { spacing: 1, snapToPixelGrid: true },
      size: { width: 2, height: 2 },
      tip: squareTip(),
    });
    layer.context.fillStyle = "#0000ff";
    layer.context.fillRect(0, 0, 100, 100);
    stroke(engine, { ...options, mode: "erase" }, [[10.7, 20.2]]);
    expect(pixel(layer, 9, 19)[3]).toBe(0);
    expect(pixel(layer, 10, 20)[3]).toBe(0);
    expect(pixel(layer, 11, 20)).toEqual([0, 0, 255, 255]);
    expect(pixel(layer, 9, 18)).toEqual([0, 0, 255, 255]);
  });
});
