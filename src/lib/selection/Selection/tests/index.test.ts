import { describe, it, expect, vi } from "vitest";
import Selection, { shapeBounds } from "..";
import Layer from "../../../classes/Layer";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";

describe("shapeBounds", () => {
  it("should return the bounds of rectangles, ellipses and polygons", () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    expect(shapeBounds({ type: "rect", rect })).toBe(rect);
    expect(shapeBounds({ type: "ellipse", rect })).toBe(rect);
    expect(
      shapeBounds({
        type: "polygon",
        points: [
          { x: 5, y: 1 },
          { x: 1, y: 9 },
          { x: 3, y: 4 },
        ],
      }),
    ).toEqual({ x: 1, y: 1, width: 4, height: 8 });
  });
});

describe("Selection", () => {
  it("should draw shapes with the mode's operation and notify", () => {
    const { factory, created } = createRecordingCanvasFactory();
    const selection = new Selection(100, 100, factory);
    const listener = vi.fn();
    selection.addEventListener("change", listener);
    selection.apply(
      { type: "rect", rect: { x: 1, y: 2, width: 3, height: 4 } },
      "replace",
    );
    selection.apply(
      { type: "ellipse", rect: { x: 0, y: 0, width: 10, height: 20 } },
      "add",
    );
    const calls = created[0]!.calls;
    expect(calls).toEqual(
      expect.arrayContaining([
        ["clearRect", 0, 0, 100, 100],
        ["rect", 1, 2, 3, 4],
        ["ellipse", 5, 10, 5, 10, 0, 0, Math.PI * 2],
        ["set:globalCompositeOperation", "source-over"],
      ]),
    );
    expect(listener).toHaveBeenCalledTimes(2);
    // The fake canvas has no pixels, so the mask is empty
    expect(selection.active).toBe(false);
  });

  it("should draw polygons and layer alpha", () => {
    const { factory, created } = createRecordingCanvasFactory();
    const selection = new Selection(100, 100, factory);
    selection.apply(
      {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 0, y: 5 },
        ],
      },
      "replace",
    );
    const layer = new Layer({ name: "L" }, 100, 100, factory);
    selection.fromAlpha(layer, "add");
    const calls = created[0]!.calls;
    expect(calls).toEqual(
      expect.arrayContaining([
        ["moveTo", 0, 0],
        ["lineTo", 5, 0],
        ["closePath"],
        ["drawImage", layer.canvas, 0, 0],
      ]),
    );
  });

  it("should clear without a mask canvas, and create real canvases by default", () => {
    const selection = new Selection(10, 10);
    const listener = vi.fn();
    selection.addEventListener("change", listener);
    selection.clear();
    expect(listener).toHaveBeenCalledOnce();
    expect(selection.mask).toBeUndefined();
  });

  it("should invert the mask, or select everything when there is none", () => {
    const { factory, created } = createRecordingCanvasFactory();
    const selection = new Selection(100, 100, factory);
    const selectAll = vi.spyOn(selection, "selectAll");
    selection.invert();
    expect(selectAll).toHaveBeenCalledOnce();
    // Pretend the mask is set, then invert it with XOR over the whole canvas
    (selection as unknown as { active: boolean }).active = true;
    const listener = vi.fn();
    selection.addEventListener("change", listener);
    selection.invert();
    expect(selectAll).toHaveBeenCalledOnce();
    expect(created[0]!.calls).toEqual(
      expect.arrayContaining([
        ["set:globalCompositeOperation", "xor"],
        ["fillRect", 0, 0, 100, 100],
      ]),
    );
    expect(listener).toHaveBeenCalledOnce();
  });
});
