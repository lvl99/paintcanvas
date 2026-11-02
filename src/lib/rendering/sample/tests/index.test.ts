import { describe, it, expect } from "vitest";
import { averageColour, pixelRect, toHex } from "..";

describe("toHex", () => {
  it("should format a colour as #rrggbb", () => {
    expect(toHex(255, 0, 128)).toBe("#ff0080");
    expect(toHex(0.4, 15.6, 254.5)).toBe("#0010ff");
  });
});

describe("averageColour", () => {
  it("should average every pixel that isn't transparent", () => {
    expect(
      averageColour(
        new Uint8ClampedArray([
          255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255,
        ]),
      ),
    ).toBe("#aa55aa");
    expect(averageColour(new Uint8ClampedArray([9, 9, 9, 0]))).toBeUndefined();
  });
});

describe("pixelRect", () => {
  it("should cover the whole pixels between two points, cut to the canvas", () => {
    expect(pixelRect({ x: 2.5, y: 8 }, { x: -3, y: 1.2 }, 100, 100)).toEqual({
      x: 0,
      y: 1,
      width: 3,
      height: 8,
    });
    expect(pixelRect({ x: 5, y: 5 }, { x: 5, y: 5 }, 100, 100)).toEqual({
      x: 5,
      y: 5,
      width: 1,
      height: 1,
    });
    expect(pixelRect({ x: 98, y: 98 }, { x: 150, y: 150 }, 100, 100)).toEqual({
      x: 98,
      y: 98,
      width: 2,
      height: 2,
    });
    expect(
      pixelRect({ x: -9, y: 5 }, { x: -1, y: 6 }, 100, 100),
    ).toBeUndefined();
    expect(
      pixelRect({ x: 5, y: 100 }, { x: 6, y: 120 }, 100, 100),
    ).toBeUndefined();
  });
});
