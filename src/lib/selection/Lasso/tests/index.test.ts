import { describe, it, expect, vi } from "vitest";
import Lasso from "..";

const none = { shiftKey: false, altKey: false };
const shift = { shiftKey: true, altKey: false };
const alt = { shiftKey: false, altKey: true };

describe("Lasso (rectangle and circle)", () => {
  it("should make a rectangle from a drag, in the mode chosen at the start", () => {
    const lasso = new Lasso();
    lasso.down("rectangle", { x: 10, y: 10 }, shift, false);
    expect(lasso.active).toBe(true);
    lasso.move({ x: 40, y: 20 }, none);
    expect(lasso.preview).toEqual({
      type: "rect",
      rect: { x: 10, y: 10, width: 30, height: 10 },
    });
    expect(lasso.up({ x: 40, y: 20 })).toEqual({
      shape: { type: "rect", rect: { x: 10, y: 10, width: 30, height: 10 } },
      mode: "add",
    });
    expect(lasso.active).toBe(false);
  });

  it("should keep sides equal while Shift is held during the drag", () => {
    const lasso = new Lasso();
    lasso.down("circle", { x: 0, y: 0 }, alt, false);
    expect(lasso.up({ x: 20, y: 5 }, shift)).toEqual({
      shape: { type: "ellipse", rect: { x: 0, y: 0, width: 20, height: 20 } },
      mode: "subtract",
    });
    lasso.down("circle", { x: 0, y: 0 }, none, false);
    lasso.move({ x: 20, y: 5 }, shift);
    expect(lasso.preview).toEqual({
      type: "ellipse",
      rect: { x: 0, y: 0, width: 20, height: 20 },
    });
  });

  it("should deselect on a click without dragging, but only in replace mode", () => {
    const lasso = new Lasso();
    lasso.down("rectangle", { x: 5, y: 5 }, none, false);
    expect(lasso.up({ x: 5.5, y: 5.5 })).toEqual({ deselect: true });
    lasso.down("rectangle", { x: 5, y: 5 }, shift, false);
    expect(lasso.up({ x: 5, y: 5 })).toBeUndefined();
  });
});

describe("Lasso (polygon)", () => {
  it("should add nodes on clicks and close on the first node", () => {
    const lasso = new Lasso();
    lasso.down("polygon", { x: 0, y: 0 }, none, false);
    expect(lasso.up({ x: 0, y: 0 })).toBeUndefined();
    lasso.move({ x: 10, y: 0 }, none);
    lasso.down("polygon", { x: 10, y: 0 }, none, false);
    lasso.move({ x: 10, y: 10 }, none);
    expect(lasso.preview).toEqual({
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    lasso.down("polygon", { x: 10, y: 10 }, none, false);
    expect(lasso.nodes).toHaveLength(3);
    expect(lasso.down("polygon", { x: 0.5, y: 0 }, none, true)).toEqual({
      shape: {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      },
      mode: "replace",
    });
    expect(lasso.nodes).toEqual([]);
  });

  it("should not close on the first node with fewer than three nodes", () => {
    const lasso = new Lasso();
    lasso.down("polygon", { x: 0, y: 0 }, none, false);
    lasso.move({ x: 10, y: 0 }, none);
    lasso.down("polygon", { x: 10, y: 0 }, none, false);
    lasso.move({ x: 1, y: 0 }, none);
    lasso.down("polygon", { x: 1, y: 0 }, none, true);
    expect(lasso.nodes).toHaveLength(3);
  });

  it("should snap lines to 45° with Shift", () => {
    const lasso = new Lasso();
    lasso.down("polygon", { x: 0, y: 0 }, none, false);
    lasso.move({ x: 10, y: 1 }, shift);
    const preview = lasso.preview;
    expect(preview?.type === "polygon" && preview.points[1]!.y).toBe(0);
  });

  it("should close on double-click without repeating the last node, or abandon tiny shapes", () => {
    const lasso = new Lasso();
    lasso.down("polygon", { x: 0, y: 0 }, none, false);
    lasso.move({ x: 10, y: 0 }, none);
    lasso.down("polygon", { x: 10, y: 0 }, none, false);
    lasso.move({ x: 10, y: 10 }, none);
    lasso.down("polygon", { x: 10, y: 10 }, none, false);
    // A double-click adds the same node again, then closes
    lasso.down("polygon", { x: 10, y: 10 }, none, false);
    const result = lasso.close();
    expect(
      result &&
        "shape" in result &&
        result.shape.type === "polygon" &&
        result.shape.points,
    ).toHaveLength(3);

    lasso.down("polygon", { x: 0, y: 0 }, none, false);
    expect(lasso.close()).toBeUndefined();
    expect(lasso.close()).toBeUndefined();
  });

  it("should restart when switching from a polygon to another tool", () => {
    const lasso = new Lasso();
    lasso.down("polygon", { x: 0, y: 0 }, none, false);
    lasso.down("rectangle", { x: 5, y: 5 }, none, false);
    expect(lasso.preview).toEqual({
      type: "rect",
      rect: { x: 5, y: 5, width: 0, height: 0 },
    });
  });
});

describe("Lasso (freeform)", () => {
  it("should record the path while dragging and close on release", () => {
    const lasso = new Lasso();
    lasso.down("freeform", { x: 0, y: 0 }, none, false);
    lasso.move({ x: 0.5, y: 0 }, none);
    lasso.move({ x: 10, y: 0 }, none);
    lasso.move({ x: 10, y: 10 }, none);
    expect(lasso.preview).toEqual({
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    expect(lasso.up({ x: 0, y: 10 })).toEqual({
      shape: {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      },
      mode: "replace",
    });
  });
});

describe("Lasso (cancel and events)", () => {
  it("should cancel the shape in progress and notify changes", () => {
    const lasso = new Lasso();
    const listener = vi.fn();
    lasso.addEventListener("change", listener);
    lasso.cancel();
    lasso.move({ x: 1, y: 1 }, none);
    expect(lasso.up({ x: 1, y: 1 })).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
    lasso.down("rectangle", { x: 0, y: 0 }, none, false);
    lasso.cancel();
    expect(lasso.active).toBe(false);
    expect(lasso.preview).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
