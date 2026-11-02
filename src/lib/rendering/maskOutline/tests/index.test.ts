import { describe, it, expect } from "vitest";
import {
  DASH_COLOURS,
  DASH_LENGTH,
  NODE_SIZE,
  drawLassoPreview,
  drawMaskOutline,
} from "..";
import Viewport from "../../../classes/Viewport";
import { createRecordingContext } from "../../../../testing/recordingContext";

/** A view at 2× zoom with the canvas at screen (10, 20) */
const createView = () => {
  const view = new Viewport(100, 100);
  view.resize(500, 500);
  view.zoomAt({ x: 0, y: 0 }, 2);
  view.panBy(10 - view.offsetX, 20 - view.offsetY);
  return view;
};

describe("drawMaskOutline", () => {
  it("should draw each loop as a white line with black dashes over it, in screen pixels with the dash offset", () => {
    const { ctx, calls } = createRecordingContext();
    drawMaskOutline(ctx as never, [[0, 0, 10, 0, 0, 0]], createView(), 2, 3);
    expect(calls).toEqual([
      ["save"],
      ["beginPath"],
      ["moveTo", 20, 40],
      ["lineTo", 60, 40],
      ["lineTo", 20, 40],
      ["set:lineWidth", 2],
      ["setLineDash", []],
      ["set:strokeStyle", DASH_COLOURS[0]],
      ["stroke"],
      ["setLineDash", [DASH_LENGTH * 2, DASH_LENGTH * 2]],
      ["set:lineDashOffset", 6],
      ["set:strokeStyle", DASH_COLOURS[1]],
      ["stroke"],
      ["restore"],
    ]);
    expect(DASH_COLOURS).toEqual(["#ffffff", "#000000"]);
  });
});

describe("drawLassoPreview", () => {
  it("should draw rectangles and ellipses scaled to the screen", () => {
    const view = createView();
    const rect = createRecordingContext();
    drawLassoPreview(
      rect.ctx as never,
      { type: "rect", rect: { x: 0, y: 0, width: 10, height: 5 } },
      [],
      view,
      1,
    );
    expect(rect.calls).toContainEqual(["rect", 10, 20, 20, 10]);
    const ellipse = createRecordingContext();
    drawLassoPreview(
      ellipse.ctx as never,
      { type: "ellipse", rect: { x: 0, y: 0, width: 10, height: 5 } },
      [],
      view,
      1,
    );
    expect(ellipse.calls).toContainEqual([
      "ellipse",
      20,
      25,
      10,
      5,
      0,
      0,
      Math.PI * 2,
    ]);
  });

  it("should draw polygon paths with handles on nodes", () => {
    const { ctx, calls } = createRecordingContext();
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    drawLassoPreview(
      ctx as never,
      { type: "polygon", points },
      points.slice(0, 1),
      createView(),
      1,
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        ["moveTo", 10, 20],
        ["lineTo", 30, 20],
        [
          "fillRect",
          10 - NODE_SIZE / 2,
          20 - NODE_SIZE / 2,
          NODE_SIZE,
          NODE_SIZE,
        ],
      ]),
    );
  });
});
