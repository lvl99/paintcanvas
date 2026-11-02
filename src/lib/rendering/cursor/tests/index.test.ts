import { describe, it, expect } from "vitest";
import { MIN_OUTLINE_SIZE, drawBrushCursor } from "..";
import BrushTip from "../../BrushTip";
import { createRecordingContext } from "../../../../testing/recordingContext";

describe("drawBrushCursor", () => {
  it("should draw a white ellipse outline for round tips, at the pixel ratio", () => {
    const { ctx, calls } = createRecordingContext();
    drawBrushCursor(ctx as never, new BrushTip(), 10, 20, 30, 10, 0, 2);
    expect(calls).toEqual([
      ["save"],
      ["set:strokeStyle", "#ffffff"],
      ["set:lineWidth", 1],
      ["translate", 20, 40],
      ["beginPath"],
      ["ellipse", 0, 0, 30, 10, 0, 0, Math.PI * 2],
      ["stroke"],
      ["restore"],
    ]);
  });

  it("should draw a shape's traced outline, centred and rotated", () => {
    const { ctx, calls } = createRecordingContext();
    const tip = new BrushTip({} as OffscreenCanvas, [[0, 0, 1, 1]]);
    drawBrushCursor(ctx as never, tip, 0, 0, 10, 20, 90, 1);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["rotate", Math.PI / 2],
        ["moveTo", -5, -10],
        ["lineTo", 5, 10],
      ]),
    );
  });

  it("should show a crosshair for very small brushes", () => {
    const { ctx, calls } = createRecordingContext();
    drawBrushCursor(
      ctx as never,
      new BrushTip(),
      0,
      0,
      MIN_OUTLINE_SIZE - 1,
      1,
      45,
      1,
    );
    expect(calls.filter(([name]) => name === "moveTo")).toHaveLength(2);
    expect(
      calls.some(([name]) => name === "ellipse" || name === "rotate"),
    ).toBe(false);
  });
});
