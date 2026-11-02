import { describe, it, expect } from "vitest";
import {
  ROTATE_HANDLE_DISTANCE,
  SCALE_HANDLES,
  boxBounds,
  boxCorners,
  boxFromRect,
  handleAt,
  handlePosition,
  isInsideBox,
  moveBox,
  resizeCursor,
  rotateBox,
  rotateHandle,
  scaleBox,
} from "..";

const box = boxFromRect({ x: 0, y: 0, width: 100, height: 50 });

/** Round numbers in an object for comparison */
const round = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      typeof v === "number" ? Math.round(v * 1000) / 1000 + 0 : v,
    ]),
  ) as T;

describe("boxFromRect and handles", () => {
  it("should centre the box on the rectangle", () => {
    expect(box).toEqual({
      cx: 50,
      cy: 25,
      width: 100,
      height: 50,
      rotation: 0,
    });
    expect(SCALE_HANDLES).toHaveLength(8);
  });

  it("should place handles at corners and edges, rotated with the box", () => {
    expect(handlePosition(box, { hx: 1, hy: 1 })).toEqual({ x: 100, y: 50 });
    expect(handlePosition(box, { hx: 0, hy: -1 })).toEqual({ x: 50, y: 0 });
    const turned = { ...box, rotation: 90 };
    expect(round(handlePosition(turned, { hx: 1, hy: 0 }))).toEqual({
      x: 50,
      y: 75,
    });
    expect(boxCorners(box)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]);
  });

  it("should find the handle under a point, in screen units", () => {
    expect(handleAt(box, SCALE_HANDLES, { x: 102, y: 49 }, 4)).toEqual({
      hx: 1,
      hy: 1,
    });
    expect(handleAt(box, SCALE_HANDLES, { x: 50, y: 25 }, 4)).toBeUndefined();
    const toScreen = ({ x, y }: { x: number; y: number }) => ({
      x: x * 2,
      y: y * 2,
    });
    expect(handleAt(box, SCALE_HANDLES, { x: 0, y: 0 }, 4, toScreen)).toEqual({
      hx: -1,
      hy: -1,
    });
  });

  it("should put the rotate handle beyond the top-centre handle, turning and flipping with the box", () => {
    expect(ROTATE_HANDLE_DISTANCE).toBe(24);
    expect(rotateHandle(box)).toEqual({
      anchor: { x: 50, y: 0 },
      handle: { x: 50, y: -24 },
    });
    // Rotated a quarter turn clockwise, "up" points right
    const turned = rotateHandle({ ...box, rotation: 90 });
    expect(round(turned.anchor)).toEqual({ x: 75, y: 25 });
    expect(round(turned.handle)).toEqual({ x: 99, y: 25 });
    // Flipped vertically, the top-centre handle is at the bottom
    expect(rotateHandle({ ...box, height: -50 }).handle).toEqual({
      x: 50,
      y: 74,
    });
    // In screen units, at a set distance
    const toScreen = ({ x, y }: { x: number; y: number }) => ({
      x: x * 2,
      y: y * 2,
    });
    expect(rotateHandle(box, toScreen, 10).handle).toEqual({ x: 100, y: -10 });
    // A box with no height points up, as it is turned
    expect(
      round(rotateHandle({ ...box, height: 0, rotation: 90 }).handle),
    ).toEqual({ x: 74, y: 25 });
  });

  it("should check whether points are inside a rotated box", () => {
    expect(isInsideBox(box, { x: 90, y: 40 })).toBe(true);
    expect(isInsideBox(box, { x: 110, y: 40 })).toBe(false);
    const turned = { ...box, rotation: 90 };
    expect(isInsideBox(turned, { x: 50, y: 70 })).toBe(true);
    expect(isInsideBox(turned, { x: 90, y: 25 })).toBe(false);
    expect(isInsideBox({ ...box, width: -100 }, { x: 90, y: 40 })).toBe(true);
  });
});

describe("moveBox", () => {
  it("should move freely, or along one axis when constrained", () => {
    expect(moveBox(box, 10, 4, false)).toMatchObject({ cx: 60, cy: 29 });
    expect(moveBox(box, 10, 4, true)).toMatchObject({ cx: 60, cy: 25 });
    expect(moveBox(box, 3, -9, true)).toMatchObject({ cx: 50, cy: 16 });
  });
});

describe("scaleBox", () => {
  const aspect = 2;

  it("should scale from a corner with the opposite corner fixed", () => {
    // Drag the bottom-right corner to (150, 100): top-left stays at (0, 0)
    expect(
      round(scaleBox(box, { hx: 1, hy: 1 }, { x: 150, y: 100 }, false, aspect)),
    ).toEqual({
      cx: 75,
      cy: 50,
      width: 150,
      height: 100,
      rotation: 0,
    });
    // Drag the top-left corner: bottom-right stays at (100, 50)
    expect(
      round(scaleBox(box, { hx: -1, hy: -1 }, { x: 50, y: 10 }, false, aspect)),
    ).toMatchObject({
      cx: 75,
      cy: 30,
      width: 50,
      height: 40,
    });
  });

  it("should scale one axis from an edge, keeping the other", () => {
    expect(
      round(scaleBox(box, { hx: 1, hy: 0 }, { x: 200, y: 999 }, false, aspect)),
    ).toMatchObject({
      cx: 100,
      cy: 25,
      width: 200,
      height: 50,
    });
    expect(
      round(
        scaleBox(box, { hx: 0, hy: -1 }, { x: -50, y: -50 }, false, aspect),
      ),
    ).toMatchObject({
      cx: 50,
      cy: 0,
      width: 100,
      height: 100,
    });
  });

  it("should flip when dragged past the opposite side", () => {
    const flipped = scaleBox(
      box,
      { hx: 1, hy: 0 },
      { x: -50, y: 25 },
      false,
      aspect,
    );
    expect(round(flipped)).toMatchObject({ cx: -25, width: -50 });
  });

  it("should keep proportions from corners and edges with Shift", () => {
    expect(
      round(scaleBox(box, { hx: 1, hy: 1 }, { x: 200, y: 60 }, true, aspect)),
    ).toMatchObject({
      width: 200,
      height: 100,
    });
    expect(
      round(scaleBox(box, { hx: 1, hy: 1 }, { x: 60, y: 100 }, true, aspect)),
    ).toMatchObject({
      width: 200,
      height: 100,
    });
    const edge = round(
      scaleBox(box, { hx: 1, hy: 0 }, { x: 200, y: 0 }, true, aspect),
    );
    expect(edge).toMatchObject({ width: 200, height: 100, cy: 25 });
    expect(
      round(scaleBox(box, { hx: 0, hy: 1 }, { x: 0, y: 100 }, true, aspect)),
    ).toMatchObject({
      width: 200,
      height: 100,
      cx: 50,
    });
    // Flipped corners keep their direction
    expect(
      round(scaleBox(box, { hx: 1, hy: 1 }, { x: -100, y: -10 }, true, aspect)),
    ).toMatchObject({
      width: -100,
      height: -50,
    });
  });

  it("should scale rotated boxes along their own axes", () => {
    const turned = { ...box, rotation: 90 };
    // The right edge of a box turned 90° points down: drag it 50 px further down
    const scaled = round(
      scaleBox(turned, { hx: 1, hy: 0 }, { x: 50, y: 125 }, false, aspect),
    );
    expect(scaled).toMatchObject({ width: 150, height: 50, cx: 50, cy: 50 });
  });
});

describe("rotateBox", () => {
  it("should rotate by how far the pointer turned around the centre", () => {
    expect(
      round(rotateBox(box, { x: 100, y: 25 }, { x: 50, y: 75 }, false))
        .rotation,
    ).toBe(90);
    expect(
      round(
        rotateBox(
          { ...box, rotation: 170 },
          { x: 100, y: 25 },
          { x: 50, y: 75 },
          false,
        ),
      ).rotation,
    ).toBe(-100);
  });

  it("should snap to 45° steps with Shift", () => {
    expect(
      rotateBox(box, { x: 100, y: 25 }, { x: 100, y: 45 }, true).rotation,
    ).toBe(0);
    expect(
      rotateBox(box, { x: 100, y: 25 }, { x: 80, y: 60 }, true).rotation,
    ).toBe(45);
  });
});

describe("resizeCursor", () => {
  it("should pick resize cursors that follow the box's rotation", () => {
    expect(resizeCursor({ hx: 1, hy: 0 }, 0)).toBe("ew-resize");
    expect(resizeCursor({ hx: 0, hy: 1 }, 0)).toBe("ns-resize");
    expect(resizeCursor({ hx: 1, hy: 1 }, 0)).toBe("nwse-resize");
    expect(resizeCursor({ hx: 1, hy: -1 }, 0)).toBe("nesw-resize");
    expect(resizeCursor({ hx: 1, hy: 0 }, 90)).toBe("ns-resize");
    expect(resizeCursor({ hx: -1, hy: 0 }, 0)).toBe("ew-resize");
  });
});

describe("boxBounds", () => {
  it("should cover a rotated box", () => {
    expect(boxBounds(box)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    const turned = boxBounds({ ...box, rotation: 90 });
    expect(Math.round(turned.width)).toBe(50);
    expect(Math.round(turned.height)).toBe(100);
  });
});
