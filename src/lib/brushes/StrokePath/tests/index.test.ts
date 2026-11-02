import { describe, it, expect } from "vitest";
import StrokePath, { DEFAULT_SPACING, MAX_SPACING, stampStep } from "..";
import { SmoothingType, type BrushStrokePoint } from "../../types";

/** Round stamp coordinates for comparison */
const round = (points: BrushStrokePoint[]) =>
  points.map(({ x, y }) => [
    Math.round(x * 100) / 100,
    Math.round(y * 100) / 100,
  ]);

/** Feed all points through a path and collect every stamp */
const run = (path: StrokePath, points: BrushStrokePoint[]) => [
  ...points.flatMap((p) => path.add(p)),
  ...path.finish(),
];

describe("stampStep", () => {
  it("should use 1–200 px with a default", () => {
    expect(stampStep(undefined)).toBe(DEFAULT_SPACING);
    expect(stampStep(0)).toBe(1);
    expect(stampStep(-5)).toBe(1);
    expect(stampStep(1000)).toBe(MAX_SPACING);
    expect(stampStep(7)).toBe(7);
  });
});

describe("StrokePath (Linear)", () => {
  it("should stamp the first point, then every step along straight lines", () => {
    const path = new StrokePath(SmoothingType.Linear, 5);
    expect(round(path.add({ x: 0, y: 0 }))).toEqual([[0, 0]]);
    expect(round(path.add({ x: 12, y: 0 }))).toEqual([
      [5, 0],
      [10, 0],
    ]);
    // Spacing carries over between segments: next stamp 3 px into the new line
    expect(round(path.add({ x: 12, y: 10 }))).toEqual([
      [12, 3],
      [12, 8],
    ]);
    expect(path.finish()).toEqual([]);
  });

  it("should treat None like Linear and default to Linear", () => {
    expect(
      round(
        run(new StrokePath(SmoothingType.None, 10), [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ]),
      ),
    ).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    expect(new StrokePath().step).toBe(DEFAULT_SPACING);
  });

  it("should interpolate pressure and tilt, keeping values only one end has", () => {
    const path = new StrokePath(SmoothingType.Linear, 5);
    path.add({ x: 0, y: 0, pressure: 0, tiltX: 10 });
    const [stamp] = path.add({ x: 10, y: 0, pressure: 1, tiltY: 20 });
    expect(stamp).toEqual({ x: 5, y: 0, pressure: 0.5, tiltX: 10, tiltY: 20 });
  });

  it("should stamp a single click once", () => {
    expect(
      run(new StrokePath(SmoothingType.BezierCubic, 5), [{ x: 3, y: 4 }]),
    ).toEqual([{ x: 3, y: 4 }]);
  });

  it("should not stamp zero-length moves twice", () => {
    expect(
      run(new StrokePath(SmoothingType.Linear, 5), [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toHaveLength(1);
  });
});

describe("StrokePath (BezierQuad)", () => {
  it("should curve through midpoints and finish at the last point", () => {
    const stamps = run(new StrokePath(SmoothingType.BezierQuad, 1), [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
    const last = stamps.at(-1)!;
    expect(Math.hypot(last.x - 20, last.y - 20)).toBeLessThan(1.01);
    // The corner at (20, 0) is cut: no stamp reaches it
    expect(stamps.every((p) => Math.hypot(p.x - 20, p.y) > 2)).toBe(true);
    // The curve passes the midpoints (10, 0) and (20, 10)
    expect(stamps.some((p) => Math.hypot(p.x - 10, p.y) < 1)).toBe(true);
    expect(stamps.some((p) => Math.hypot(p.x - 20, p.y - 10) < 1)).toBe(true);
  });

  it("should place stamps evenly along curves", () => {
    const stamps = run(new StrokePath(SmoothingType.BezierQuad, 4), [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ]);
    for (let i = 2; i < stamps.length - 1; i++) {
      const gap = Math.hypot(
        stamps[i]!.x - stamps[i - 1]!.x,
        stamps[i]!.y - stamps[i - 1]!.y,
      );
      expect(gap).toBeGreaterThan(3.5);
      expect(gap).toBeLessThanOrEqual(4.01);
    }
  });
});

describe("StrokePath (BezierCubic)", () => {
  it("should lag one point, then draw a smooth curve through every point", () => {
    const path = new StrokePath(SmoothingType.BezierCubic, 1);
    expect(path.add({ x: 0, y: 0 })).toHaveLength(1);
    expect(path.add({ x: 20, y: 0 })).toEqual([]);
    const middle = path.add({ x: 20, y: 20 });
    expect(Math.hypot(middle.at(-1)!.x - 20, middle.at(-1)!.y)).toBeLessThan(
      1.01,
    );
    const end = path.add({ x: 0, y: 20 });
    expect(end.length).toBeGreaterThan(0);
    const rest = path.finish();
    const last = rest.at(-1)!;
    expect(Math.hypot(last.x, last.y - 20)).toBeLessThan(1.01);
  });

  it("should bulge outwards at corners, following the movement", () => {
    const stamps = run(new StrokePath(SmoothingType.BezierCubic, 1), [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
    // Leaving (0,0) towards (20,20) direction makes the first segment dip below y = 0
    expect(Math.min(...stamps.map((p) => p.y))).toBeLessThan(0);
  });

  it("should finish a two-point stroke as a straight line", () => {
    expect(
      round(
        run(new StrokePath(SmoothingType.BezierCubic, 5), [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
      ),
    ).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
    ]);
  });
});

describe("StrokePath (finish)", () => {
  it("should return nothing to finish for empty or single-point strokes", () => {
    expect(new StrokePath(SmoothingType.BezierQuad).finish()).toEqual([]);
    const path = new StrokePath(SmoothingType.BezierQuad);
    path.add({ x: 0, y: 0 });
    expect(path.finish()).toEqual([]);
  });
});
