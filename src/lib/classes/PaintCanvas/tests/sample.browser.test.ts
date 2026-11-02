import { describe, it, expect } from "vitest";
import PaintCanvas from "..";
import { readPixels, SAMPLE_PIXELS } from "../../../rendering/sample";

/** A 100×100 app whose layer has a red block on its left half, over the white background */
const setup = () => {
  const app = new PaintCanvas({
    width: 100,
    height: 100,
  });
  const ctx = app.layers.active.context;
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 50, 100);
  return app;
};

describe("colour sampling in a real browser", () => {
  it("should sample the colour shown at a point, or nothing outside the canvas", () => {
    const app = setup();
    expect(app.sampleColour({ x: 10.7, y: 20.2 })).toBe("#ff0000");
    expect(app.sampleColour({ x: 75, y: 50 })).toBe("#ffffff");
    expect(app.sampleColour({ x: -1, y: 50 })).toBeUndefined();
    // Hidden layers aren't shown, so aren't sampled
    app.layers.active.visible = false;
    expect(app.sampleColour({ x: 10, y: 20 })).toBe("#ffffff");
  });

  it("should average every pixel shown in an area, exactly or from a smaller copy", () => {
    const app = setup();
    // 50 red and 50 white columns
    expect(app.sampleAreaColour({ x: 0, y: 0 }, { x: 99, y: 99 })).toBe(
      "#ff8080",
    );
    expect(app.sampleAreaColour({ x: 0, y: 0 }, { x: 99, y: 99 }, 10)).toBe(
      "#ff8080",
    );
    // Cut to the canvas
    expect(app.sampleAreaColour({ x: -50, y: 0 }, { x: 9, y: 9 })).toBe(
      "#ff0000",
    );
    expect(
      app.sampleAreaColour({ x: -50, y: 0 }, { x: -9, y: 9 }),
    ).toBeUndefined();
  });

  it("should give the pixels around a point, transparent outside the canvas", () => {
    const app = setup();
    const pixels = app.samplePixels({ x: 2.5, y: 50 });
    expect([pixels.width, pixels.height]).toEqual([
      SAMPLE_PIXELS,
      SAMPLE_PIXELS,
    ]);
    const data = readPixels(pixels);
    const at = (x: number) => [...data.slice(x * 4, x * 4 + 4)];
    // The point's pixel (2, 50) is in the middle: x 5 of 10, so the first 3 columns are outside the canvas
    expect(at(2)).toEqual([0, 0, 0, 0]);
    expect(at(3)).toEqual([255, 0, 0, 255]);
    expect(at(5)).toEqual([255, 0, 0, 255]);
  });
});
