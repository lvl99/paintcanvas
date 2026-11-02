import { describe, it, expect } from "vitest";
import Selection from "..";
import Layer from "../../../classes/Layer";

/** Read the mask value (alpha) at a pixel */
const maskAt = (selection: Selection, x: number, y: number) =>
  selection.mask
    ? (selection.mask.getContext("2d")!.getImageData(x, y, 1, 1)
        .data[3] as number)
    : 0;

describe("Selection in a real browser", () => {
  it("should mask a rectangle, replacing any previous mask", () => {
    const selection = new Selection(100, 100);
    selection.apply(
      { type: "rect", rect: { x: 0, y: 0, width: 10, height: 10 } },
      "replace",
    );
    selection.apply(
      { type: "rect", rect: { x: 20, y: 20, width: 30, height: 10 } },
      "replace",
    );
    expect(selection.active).toBe(true);
    expect(maskAt(selection, 25, 25)).toBe(255);
    expect(maskAt(selection, 5, 5)).toBe(0);
    expect(selection.outline).toHaveLength(1);
  });

  it("should add and subtract shapes", () => {
    const selection = new Selection(100, 100);
    selection.apply(
      { type: "rect", rect: { x: 10, y: 10, width: 40, height: 40 } },
      "replace",
    );
    selection.apply(
      { type: "rect", rect: { x: 40, y: 40, width: 40, height: 40 } },
      "add",
    );
    selection.apply(
      { type: "ellipse", rect: { x: 20, y: 20, width: 20, height: 20 } },
      "subtract",
    );
    expect(maskAt(selection, 15, 15)).toBe(255);
    expect(maskAt(selection, 70, 70)).toBe(255);
    expect(maskAt(selection, 30, 30)).toBe(0);
    // A hole adds an inner loop to the outline
    expect(selection.outline.length).toBeGreaterThanOrEqual(2);
  });

  it("should mask polygons and ellipses", () => {
    const selection = new Selection(100, 100);
    selection.apply(
      {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 60, y: 0 },
          { x: 0, y: 60 },
        ],
      },
      "replace",
    );
    expect(maskAt(selection, 10, 10)).toBe(255);
    expect(maskAt(selection, 50, 50)).toBe(0);
    selection.apply(
      { type: "ellipse", rect: { x: 50, y: 50, width: 40, height: 40 } },
      "replace",
    );
    expect(maskAt(selection, 70, 70)).toBe(255);
    expect(maskAt(selection, 52, 52)).toBe(0);
  });

  it("should become inactive when everything is subtracted, and ignore subtracting with no mask", () => {
    const selection = new Selection(100, 100);
    selection.apply(
      { type: "rect", rect: { x: 0, y: 0, width: 10, height: 10 } },
      "subtract",
    );
    expect(selection.active).toBe(false);
    selection.apply(
      { type: "rect", rect: { x: 10, y: 10, width: 10, height: 10 } },
      "replace",
    );
    selection.apply(
      { type: "rect", rect: { x: 0, y: 0, width: 50, height: 50 } },
      "subtract",
    );
    expect(selection.active).toBe(false);
    expect(selection.mask).toBeUndefined();
    expect(selection.outline).toEqual([]);
  });

  it("should select all and deselect", () => {
    const selection = new Selection(50, 50);
    selection.selectAll();
    expect(maskAt(selection, 0, 0)).toBe(255);
    expect(maskAt(selection, 49, 49)).toBe(255);
    selection.clear();
    expect(selection.active).toBe(false);
  });

  it("should mask a layer's pixels following their alpha", () => {
    const layer = new Layer({ name: "L" }, 100, 100);
    layer.context.fillStyle = "rgba(255, 0, 0, 0.5)";
    layer.context.fillRect(10, 10, 20, 20);
    const selection = new Selection(100, 100);
    selection.fromAlpha(layer);
    expect(maskAt(selection, 20, 20)).toBeGreaterThanOrEqual(127);
    expect(maskAt(selection, 20, 20)).toBeLessThanOrEqual(128);
    expect(maskAt(selection, 50, 50)).toBe(0);
    expect(selection.active).toBe(true);
  });

  it("should ignore shapes entirely outside the canvas", () => {
    const selection = new Selection(100, 100);
    selection.apply(
      { type: "rect", rect: { x: 200, y: 200, width: 10, height: 10 } },
      "replace",
    );
    expect(selection.active).toBe(false);
  });
});
