import { describe, it, expect } from "vitest";
import Transformer from "..";
import Layer from "../../../classes/Layer";
import Selection from "../../../selection/Selection";
import { boxBounds } from "../../geometry";
import { drawTransformed } from "..";

const pixel = (layer: Layer, x: number, y: number) => [
  ...layer.context.getImageData(x, y, 1, 1).data,
];

/** A 100×100 layer with a red 20×10 block at (10, 10) and a blue pixel block at (60, 60) */
const createLayer = () => {
  const layer = new Layer({ name: "L" }, 100, 100);
  layer.context.fillStyle = "#ff0000";
  layer.context.fillRect(10, 10, 20, 10);
  layer.context.fillStyle = "#0000ff";
  layer.context.fillRect(60, 60, 10, 10);
  return layer;
};

describe("transforms in a real browser", () => {
  it("should move all the layer's pixels", () => {
    const layer = createLayer();
    const transformer = new Transformer(100, 100);
    transformer.prepare(layer);
    expect(transformer.source).toEqual({ x: 10, y: 10, width: 60, height: 60 });
    transformer.setBox({ ...transformer.box!, cx: transformer.box!.cx + 20 });
    // The layer has a hole until the transform is committed
    expect(pixel(layer, 15, 15)[3]).toBe(0);
    transformer.commit();
    expect(pixel(layer, 35, 15)).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 15, 15)[3]).toBe(0);
    expect(pixel(layer, 85, 65)).toEqual([0, 0, 255, 255]);
  });

  it("should put pixels back exactly on cancel", () => {
    const layer = createLayer();
    const transformer = new Transformer(100, 100);
    transformer.prepare(layer);
    transformer.setBox({ ...transformer.box!, rotation: 30, width: 10 });
    transformer.cancel();
    expect(pixel(layer, 15, 15)).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 65, 65)).toEqual([0, 0, 255, 255]);
  });

  it("should scale pixels into the new box", () => {
    const layer = new Layer({ name: "L" }, 100, 100);
    layer.context.fillStyle = "#00ff00";
    layer.context.fillRect(10, 10, 10, 10);
    const transformer = new Transformer(100, 100);
    transformer.prepare(layer);
    transformer.setBox({ cx: 50, cy: 50, width: 40, height: 20, rotation: 0 });
    transformer.commit();
    expect(pixel(layer, 32, 42)).toEqual([0, 255, 0, 255]);
    expect(pixel(layer, 68, 58)).toEqual([0, 255, 0, 255]);
    expect(pixel(layer, 50, 35)[3]).toBe(0);
  });

  it("should only move masked pixels, and move the mask with them", () => {
    const layer = createLayer();
    const selection = new Selection(100, 100);
    selection.apply(
      { type: "rect", rect: { x: 0, y: 0, width: 40, height: 40 } },
      "replace",
    );
    const transformer = new Transformer(100, 100);
    transformer.prepare(layer, selection.mask);
    expect(transformer.source).toEqual({ x: 10, y: 10, width: 20, height: 10 });
    transformer.setBox({ ...transformer.box!, cy: transformer.box!.cy + 30 });
    const result = transformer.commit()!;
    selection.moveArea(
      result.maskPiece!,
      result.source,
      boxBounds(result.box),
      (ctx) => drawTransformed(ctx, result.maskPiece!, result.box),
    );
    expect(pixel(layer, 15, 45)).toEqual([255, 0, 0, 255]);
    expect(pixel(layer, 15, 15)[3]).toBe(0);
    // Unmasked pixels stay put
    expect(pixel(layer, 65, 65)).toEqual([0, 0, 255, 255]);
    const maskAt = (x: number, y: number) =>
      selection.mask!.getContext("2d")!.getImageData(x, y, 1, 1).data[3];
    expect(maskAt(15, 45)).toBe(255);
    expect(maskAt(15, 15)).toBe(0);
    // Parts of the mask outside the moved pixels stay
    expect(maskAt(35, 35)).toBe(255);
  });

  it("should do nothing to the mask when none is active", () => {
    const selection = new Selection(10, 10);
    selection.moveArea(
      new OffscreenCanvas(1, 1),
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 1, height: 1 },
      () => {},
    );
    expect(selection.active).toBe(false);
  });
});
