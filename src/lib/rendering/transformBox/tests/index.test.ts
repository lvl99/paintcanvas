import { describe, it, expect } from "vitest";
import { HANDLE_SIZE, drawTransformBox } from "..";
import Viewport from "../../../classes/Viewport";
import {
  ROTATE_HANDLE_DISTANCE,
  SCALE_HANDLES,
  boxFromRect,
} from "../../../transform/geometry";
import { createRecordingContext } from "../../../../testing/recordingContext";

describe("drawTransformBox", () => {
  it("should draw the box outline and the rotate handle's line twice (white then black), a square handle at each handle position and the round rotate handle", () => {
    const view = new Viewport(100, 100);
    view.resize(200, 200);
    view.zoomAt({ x: 0, y: 0 }, 1);
    view.panBy(-view.offsetX, -view.offsetY);
    const { ctx, calls } = createRecordingContext();
    drawTransformBox(
      ctx as never,
      boxFromRect({ x: 10, y: 10, width: 20, height: 20 }),
      SCALE_HANDLES,
      view,
      1,
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        ["moveTo", 10, 10],
        ["lineTo", 30, 10],
        ["lineTo", 10, 10],
        ["set:strokeStyle", "#ffffff"],
        ["set:strokeStyle", "#000000"],
        [
          "fillRect",
          10 - HANDLE_SIZE / 2,
          10 - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE,
        ],
      ]),
    );
    expect(calls.filter(([name]) => name === "fillRect")).toHaveLength(8);
    // Outline and line twice each, and the round handle's border
    expect(calls.filter(([name]) => name === "stroke")).toHaveLength(5);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["moveTo", 20, 10],
        ["lineTo", 20, 10 - ROTATE_HANDLE_DISTANCE],
        [
          "ellipse",
          20,
          10 - ROTATE_HANDLE_DISTANCE,
          HANDLE_SIZE / 2,
          HANDLE_SIZE / 2,
          0,
          0,
          Math.PI * 2,
        ],
        ["fill"],
      ]),
    );
  });
});
