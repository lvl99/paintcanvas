import { describe, it, expect } from "vitest";
import {
  CANVAS_BACKGROUND,
  PASTEBOARD_COLOUR,
  drawFlattened,
  drawLayers,
  drawScene,
  screenArea,
  sourceArea,
} from "..";
import LayerStack from "../../../classes/LayerStack";
import { BlendMode } from "../../../classes/Layer";
import Viewport from "../../../classes/Viewport";
import { createFakeCanvasFactory } from "../../../../testing/fakeCanvas";
import { createRecordingContext } from "../../../../testing/recordingContext";

/** Create a stack of three layers: top (multiply, 50%), middle (hidden), bottom */
const createLayers = () => {
  const stack = new LayerStack(100, 50, createFakeCanvasFactory());
  const bottom = stack.active;
  const middle = stack.create();
  const top = stack.create();
  stack.update(top.id, { blendMode: BlendMode.Multiply, opacity: 0.5 });
  stack.update(middle.id, { visible: false });
  return { layers: stack.layers, top, middle, bottom };
};

describe("drawLayers", () => {
  it("should draw visible layers from bottom to top with their opacity and blend mode", () => {
    const { layers, top, bottom } = createLayers();
    const { ctx, calls } = createRecordingContext();
    drawLayers(ctx, layers);
    expect(calls).toEqual([
      ["set:globalAlpha", 1],
      ["set:globalCompositeOperation", BlendMode.Normal],
      ["drawImage", bottom.canvas, 0, 0],
      ["set:globalAlpha", 0.5],
      ["set:globalCompositeOperation", BlendMode.Multiply],
      ["drawImage", top.canvas, 0, 0],
      ["set:globalAlpha", 1],
      ["set:globalCompositeOperation", "source-over"],
    ]);
  });

  it("should draw an override image in place of its layer", () => {
    const { layers, top, bottom } = createLayers();
    const image = { preview: true } as unknown as CanvasImageSource;
    const { ctx, calls } = createRecordingContext();
    drawLayers(ctx, layers, { layer: top, image });
    const drawn = calls
      .filter(([name]) => name === "drawImage")
      .map(([, source]) => source);
    expect(drawn).toEqual([bottom.canvas, image]);
  });

  it("should skip fully transparent layers", () => {
    const { layers, top } = createLayers();
    top.opacity = 0;
    const { ctx, calls } = createRecordingContext();
    drawLayers(ctx, layers);
    expect(calls.filter(([name]) => name === "drawImage")).toHaveLength(1);
  });
});

describe("drawFlattened", () => {
  it("should scale the whole canvas onto the target with a white background", () => {
    const { layers } = createLayers();
    const { ctx, calls } = createRecordingContext();
    drawFlattened(ctx, layers, 100, 50, 20, 10);
    expect(calls.slice(0, 5)).toEqual([
      ["save"],
      ["setTransform", 0.2, 0, 0, 0.2, 0, 0],
      ["set:imageSmoothingEnabled", true],
      ["set:fillStyle", CANVAS_BACKGROUND],
      ["fillRect", 0, 0, 100, 50],
    ]);
    expect(calls.at(-1)).toEqual(["restore"]);
  });
});

describe("drawScene", () => {
  it("should draw the surround, then the canvas positioned and scaled by the view and pixel ratio", () => {
    const { layers } = createLayers();
    const view = new Viewport(100, 50);
    view.resize(400, 300);
    view.zoomAt({ x: 0, y: 0 }, 2);
    view.panBy(10, 20);
    const { ctx, calls } = createRecordingContext();
    drawScene(ctx, layers, view, 2);
    expect(calls.slice(0, 9)).toEqual([
      ["save"],
      ["setTransform", 1, 0, 0, 1, 0, 0],
      ["set:fillStyle", PASTEBOARD_COLOUR],
      ["fillRect", 0, 0, 800, 600],
      ["setTransform", 4, 0, 0, 4, 20, 40],
      ["set:imageSmoothingEnabled", false],
      ["set:fillStyle", CANVAS_BACKGROUND],
      ["fillRect", 0, 0, 100, 50],
      ["set:globalAlpha", 1],
    ]);
    expect(calls.at(-1)).toEqual(["restore"]);
  });

  it("should redraw only the screen pixels showing an area, from that area of each layer", () => {
    const { layers } = createLayers();
    const view = new Viewport(100, 50);
    view.resize(400, 300);
    view.zoomAt({ x: 0, y: 0 }, 2);
    view.panBy(10, 20);
    const { ctx, calls } = createRecordingContext();
    drawScene(ctx, layers, view, 2, undefined, {
      x: 10,
      y: 10,
      width: 5,
      height: 5,
    });
    // Canvas 10–15 is screen (10 × 4 + 20)–(15 × 4 + 20) across and (10 × 4 + 40)–(15 × 4 + 40) down, plus a pixel
    expect(calls.slice(0, 11)).toEqual([
      ["save"],
      ["setTransform", 1, 0, 0, 1, 0, 0],
      ["set:fillStyle", PASTEBOARD_COLOUR],
      ["beginPath"],
      ["rect", 59, 79, 22, 22],
      ["clip"],
      ["fillRect", 59, 79, 22, 22],
      ["setTransform", 4, 0, 0, 4, 20, 40],
      ["set:imageSmoothingEnabled", false],
      ["set:fillStyle", CANVAS_BACKGROUND],
      ["fillRect", 7, 7, 11, 11],
    ]);
    const images = calls.filter(([name]) => name === "drawImage");
    expect(images.length).toBeGreaterThan(0);
    for (const call of images)
      expect(call.slice(2)).toEqual([7, 7, 11, 11, 7, 7, 11, 11]);
    expect(calls.at(-1)).toEqual(["restore"]);
  });

  it("should smooth pixels when zoomed out", () => {
    const view = new Viewport(100, 50);
    view.resize(400, 300);
    view.zoomAt({ x: 0, y: 0 }, 0.5);
    const { ctx, calls } = createRecordingContext();
    drawScene(ctx, [], view, 1);
    expect(calls).toContainEqual(["set:imageSmoothingEnabled", true]);
  });
});

describe("screenArea", () => {
  it("should find the screen pixels showing an area, rounded outwards with a pixel more on each side", () => {
    const view = { zoom: 1, offsetX: 0, offsetY: 0 };
    expect(screenArea({ x: 10, y: 10, width: 5, height: 5 }, view, 2)).toEqual({
      x: 19,
      y: 19,
      width: 12,
      height: 12,
    });
    expect(
      screenArea(
        { x: 10, y: 10, width: 5, height: 5 },
        { zoom: 0.3, offsetX: 1.5, offsetY: 0 },
        1,
      ),
    ).toEqual({ x: 3, y: 2, width: 4, height: 4 });
  });
});

describe("sourceArea", () => {
  it("should grow an area to cover two screen pixels, within the canvas", () => {
    expect(
      sourceArea({ x: 10, y: 10, width: 5, height: 5 }, 0.5, 2000, 2000),
    ).toEqual({ x: 5, y: 5, width: 15, height: 15 });
    expect(
      sourceArea({ x: 10, y: 10, width: 5, height: 5 }, 4, 2000, 2000),
    ).toEqual({ x: 7, y: 7, width: 11, height: 11 });
    expect(sourceArea({ x: 1, y: 1, width: 5, height: 5 }, 1, 7, 7)).toEqual({
      x: 0,
      y: 0,
      width: 7,
      height: 7,
    });
  });
});
