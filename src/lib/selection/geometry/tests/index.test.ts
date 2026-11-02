import { describe, it, expect } from "vitest";
import { isNear, maskModeFor, rectFromCorners, snapAngle } from "..";

describe("maskModeFor", () => {
  it("should add with Shift, subtract with Alt, and replace otherwise", () => {
    expect(maskModeFor({ shiftKey: false, altKey: false })).toBe("replace");
    expect(maskModeFor({ shiftKey: true, altKey: false })).toBe("add");
    expect(maskModeFor({ shiftKey: false, altKey: true })).toBe("subtract");
    expect(maskModeFor({ shiftKey: true, altKey: true })).toBe("subtract");
  });
});

describe("rectFromCorners", () => {
  it("should normalise rectangles dragged in any direction", () => {
    expect(rectFromCorners({ x: 10, y: 10 }, { x: 0, y: 4 })).toEqual({
      x: 0,
      y: 4,
      width: 10,
      height: 6,
    });
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 5, y: 8 })).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 8,
    });
  });

  it("should make squares that keep the drag direction", () => {
    expect(rectFromCorners({ x: 10, y: 10 }, { x: 0, y: 4 }, true)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 3, y: 8 }, true)).toEqual({
      x: 0,
      y: 0,
      width: 8,
      height: 8,
    });
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 0, y: 0 }, true)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("snapAngle", () => {
  it("should snap lines to multiples of 45°", () => {
    expect(snapAngle({ x: 0, y: 0 }, { x: 10, y: 1 })).toEqual({
      x: 10.049875621,
      y: 0,
    });
    expect(snapAngle({ x: 0, y: 0 }, { x: 1, y: -10 })).toEqual({
      x: 0,
      y: -10.049875621,
    });
    const diagonal = snapAngle({ x: 5, y: 5 }, { x: 15, y: 14 });
    expect(diagonal.x - 5).toBeCloseTo(diagonal.y - 5);
  });
});

describe("isNear", () => {
  it("should compare distances", () => {
    expect(isNear({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
    expect(isNear({ x: 0, y: 0 }, { x: 3, y: 4 }, 4.9)).toBe(false);
  });
});
