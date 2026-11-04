import { describe, it, expect } from "vitest";
import LayerStack from "../../../classes/LayerStack";
import type Layer from "../../../classes/Layer";
import StrokeEngine, {
  BEFORE_COMMIT_EVENT,
  type StrokeCommitDetail,
} from "../../../brushes/StrokeEngine";
import BrushTip from "../../../rendering/BrushTip";
import { SmoothingType } from "../../../brushes/types";
import Transformer from "../../../transform/Transformer";
import PaintCanvas, { Tool } from "..";

/** All of a layer's pixels */
const pixels = (layer: Layer) => [
  ...layer.context.getImageData(0, 0, layer.width, layer.height).data,
];

/** A 100×100 stack whose layer has a half-transparent red block at (10, 10) */
const setup = () => {
  const stack = new LayerStack(100, 100);
  const layer = stack.active;
  layer.context.fillStyle = "rgba(255, 0, 0, 0.5)";
  layer.context.fillRect(10, 10, 20, 10);
  return { stack, layer };
};

describe("undo and redo in a real browser", () => {
  it("should undo and redo a stroke exactly", () => {
    const { stack, layer } = setup();
    const engine = new StrokeEngine(100, 100);
    engine.addEventListener(BEFORE_COMMIT_EVENT, (event) => {
      const { layer, area } = (event as CustomEvent<StrokeCommitDetail>).detail;
      stack.recordImage(layer.id, area);
    });
    const original = pixels(layer);
    engine.begin(
      {
        layer,
        mode: "paint",
        preset: {
          id: "p",
          spacing: 1,
          sampleRate: 10,
          smoothingType: SmoothingType.Linear,
          alpha: 0.7,
        },
        size: { width: 10, height: 10 },
        colour: "#0000ff",
        tip: new BrushTip(),
        isPen: false,
      },
      { x: 5, y: 15 },
      0,
    );
    engine.end({ x: 60, y: 15 }, 50);
    const painted = pixels(layer);
    expect(painted).not.toEqual(original);
    stack.history.undo();
    expect(pixels(layer)).toEqual(original);
    stack.history.redo();
    expect(pixels(layer)).toEqual(painted);
  });

  it("should undo and redo a transform exactly", () => {
    const { stack, layer } = setup();
    const transformer = new Transformer(100, 100);
    const original = pixels(layer);
    transformer.prepare(layer);
    transformer.setBox({ ...transformer.box!, cx: 70, rotation: 45 });
    const { area, before } = transformer.commit()!;
    stack.recordImage(layer.id, area, before);
    const moved = pixels(layer);
    expect(moved).not.toEqual(original);
    stack.history.undo();
    expect(pixels(layer)).toEqual(original);
    stack.history.redo();
    expect(pixels(layer)).toEqual(moved);
  });

  it("should undo clearing a layer exactly", () => {
    const { stack, layer } = setup();
    const original = pixels(layer);
    stack.clear(layer.id);
    expect(pixels(layer).every((value) => value === 0)).toBe(true);
    stack.history.undo();
    expect(pixels(layer)).toEqual(original);
  });
});

describe("cut, copy and paste in a real browser", () => {
  /** A 100×100 app whose layer has a red block at (10, 10) and a blue block at (60, 60), with the red block masked */
  const setupApp = () => {
    const app = new PaintCanvas({
      width: 100,
      height: 100,
    });
    const layer = app.layers.active;
    layer.context.fillStyle = "#ff0000";
    layer.context.fillRect(10, 10, 20, 10);
    layer.context.fillStyle = "#0000ff";
    layer.context.fillRect(60, 60, 10, 10);
    app.selection.apply(
      { type: "rect", rect: { x: 0, y: 0, width: 40, height: 40 } },
      "replace",
    );
    return { app, layer };
  };

  /** One pixel of a layer as [r, g, b, a] */
  const pixel = (layer: Layer, x: number, y: number) => [
    ...layer.context.getImageData(x, y, 1, 1).data,
  ];

  it("should cut only the masked image data, and undo the cut", () => {
    const { app, layer } = setupApp();
    const original = pixels(layer);
    app.cut();
    expect(pixel(layer, 15, 15)[3]).toBe(0);
    expect(pixel(layer, 65, 65)).toEqual([0, 0, 255, 255]);
    app.undo();
    expect(pixels(layer)).toEqual(original);
  });

  it("should paint the masked image data with the background colour when the layer's alpha lock is on", () => {
    const { app, layer } = setupApp();
    app.layers.update(layer.id, { alphaLock: true });
    app.setColour("#00ff00", "background");
    app.deleteMasked();
    expect(pixel(layer, 15, 15)).toEqual([0, 255, 0, 255]);
    // Transparent pixels inside the mask stay transparent
    expect(pixel(layer, 5, 5)[3]).toBe(0);
    expect(pixel(layer, 65, 65)).toEqual([0, 0, 255, 255]);
    app.undo();
    expect(pixel(layer, 15, 15)).toEqual([255, 0, 0, 255]);
  });

  it("should paste where the image data was copied from, move it, and write it in on Enter", () => {
    const { app, layer } = setupApp();
    app.copy();
    const second = app.layers.create();
    app.paste();
    expect(app.tool).toBe(Tool.Move);
    // Not written into the layer until applied
    expect(pixel(second, 15, 15)[3]).toBe(0);
    app.transform.setBox({
      ...app.transform.box!,
      cy: app.transform.box!.cy + 50,
    });
    app.commitTransform();
    expect(pixel(second, 15, 65)).toEqual([255, 0, 0, 255]);
    expect(pixel(second, 15, 15)[3]).toBe(0);
    // The copied layer is unchanged
    expect(pixel(layer, 15, 15)).toEqual([255, 0, 0, 255]);
    app.undo();
    expect(pixels(second).every((value) => value === 0)).toBe(true);
    app.redo();
    expect(pixel(second, 15, 65)).toEqual([255, 0, 0, 255]);
  });
});
