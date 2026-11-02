import { describe, it, expect } from "vitest";
import { drawFlattened, drawScene } from "..";
import LayerStack from "../../../classes/LayerStack";
import { BlendMode } from "../../../classes/Layer";
import Viewport from "../../../classes/Viewport";

/** Read one pixel's RGBA values */
const pixel = (ctx: CanvasRenderingContext2D, x: number, y: number) => [
  ...ctx.getImageData(x, y, 1, 1).data,
];

/** Create a screen canvas and its context */
const createScreen = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext("2d", { willReadFrequently: true })!;
};

/** Fill a whole layer with a colour */
const fill = (stack: LayerStack, id: string, colour: string) => {
  const layer = stack.get(id);
  layer.context.fillStyle = colour;
  layer.context.fillRect(0, 0, layer.width, layer.height);
};

/** Create a view showing a canvas at 1:1 at the screen's top-left */
const createView = (
  canvasWidth: number,
  canvasHeight: number,
  screenWidth: number,
  screenHeight: number,
) => {
  const view = new Viewport(canvasWidth, canvasHeight);
  view.resize(screenWidth, screenHeight);
  view.zoomAt({ x: 0, y: 0 }, 1);
  view.panBy(-view.offsetX, -view.offsetY);
  return view;
};

describe("compositing in a real browser", () => {
  it("should show the white canvas on a grey surround", () => {
    const stack = new LayerStack(10, 10);
    const view = createView(10, 10, 20, 20);
    const ctx = createScreen(20, 20);
    drawScene(ctx, stack.layers, view, 1);
    expect(pixel(ctx, 5, 5)).toEqual([255, 255, 255, 255]);
    expect(pixel(ctx, 15, 15)).toEqual([128, 128, 128, 255]);
  });

  it("should apply layer opacity over the white canvas", () => {
    const stack = new LayerStack(10, 10);
    fill(stack, stack.active.id, "#ff0000");
    stack.update(stack.active.id, { opacity: 0.5 });
    const ctx = createScreen(10, 10);
    drawScene(ctx, stack.layers, createView(10, 10, 10, 10), 1);
    const [r, g, b] = pixel(ctx, 5, 5);
    expect(r).toBe(255);
    // 50% of the way from white to red; browsers round slightly differently
    expect(g).toBeGreaterThanOrEqual(125);
    expect(g).toBeLessThanOrEqual(130);
    expect(b).toBe(g);
  });

  it("should blend layers with the layers below in order", () => {
    const stack = new LayerStack(10, 10);
    fill(stack, stack.active.id, "#ffff00");
    const top = stack.create();
    fill(stack, top.id, "#00ffff");
    stack.update(top.id, { blendMode: BlendMode.Multiply });
    const ctx = createScreen(10, 10);
    drawScene(ctx, stack.layers, createView(10, 10, 10, 10), 1);
    // Yellow × cyan = green
    expect(pixel(ctx, 5, 5)).toEqual([0, 255, 0, 255]);
  });

  it("should not draw hidden layers", () => {
    const stack = new LayerStack(10, 10);
    fill(stack, stack.active.id, "#000000");
    stack.update(stack.active.id, { visible: false });
    const ctx = createScreen(10, 10);
    drawScene(ctx, stack.layers, createView(10, 10, 10, 10), 1);
    expect(pixel(ctx, 5, 5)).toEqual([255, 255, 255, 255]);
  });

  it("should keep pixels sharp when zoomed in, at the screen's pixel ratio", () => {
    const stack = new LayerStack(4, 4);
    stack.active.context.fillStyle = "#000000";
    stack.active.context.fillRect(1, 1, 1, 1);
    const view = createView(4, 4, 32, 32);
    view.zoomAt({ x: 0, y: 0 }, 4);
    const ctx = createScreen(64, 64);
    drawScene(ctx, stack.layers, view, 2);
    // Canvas pixel (1, 1) covers device pixels 8–15 at zoom 4 × ratio 2
    expect(pixel(ctx, 8, 8)).toEqual([0, 0, 0, 255]);
    expect(pixel(ctx, 15, 15)).toEqual([0, 0, 0, 255]);
    expect(pixel(ctx, 7, 7)).toEqual([255, 255, 255, 255]);
    expect(pixel(ctx, 16, 16)).toEqual([255, 255, 255, 255]);
  });

  it("should flatten the whole canvas onto a smaller target", () => {
    const stack = new LayerStack(100, 100);
    stack.active.context.fillStyle = "#0000ff";
    stack.active.context.fillRect(0, 0, 50, 100);
    const ctx = createScreen(10, 10);
    drawFlattened(ctx, stack.layers, 100, 100, 10, 10);
    expect(pixel(ctx, 2, 5)).toEqual([0, 0, 255, 255]);
    expect(pixel(ctx, 7, 5)).toEqual([255, 255, 255, 255]);
  });
});
