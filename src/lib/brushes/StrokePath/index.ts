import { SmoothingType, type BrushStrokePoint } from "../types";

/** Largest allowed spacing between stamps, in pixels */
export const MAX_SPACING = 200;

/** Default spacing between stamps, in pixels */
export const DEFAULT_SPACING = 5;

/** Length in pixels of the straight pieces curves are split into */
export const CURVE_STEP = 1;

/**
 * Distance between stamps for a preset's spacing: 0–200 px, where 0 means a stamp at every pixel.
 *
 * @example
 * stampStep(0); // 1
 * stampStep(500); // 200
 */
export const stampStep = (spacing: number | undefined): number =>
  Math.max(1, Math.min(MAX_SPACING, spacing ?? DEFAULT_SPACING));

/**
 * Interpolate between two stroke points: position, pressure and tilt.
 */
const mix = (
  a: BrushStrokePoint,
  b: BrushStrokePoint,
  t: number,
): BrushStrokePoint => {
  const value = (from: number | undefined, to: number | undefined) =>
    from === undefined || to === undefined
      ? (from ?? to)
      : from + (to - from) * t;
  const point: BrushStrokePoint = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
  const pressure = value(a.pressure, b.pressure);
  const tiltX = value(a.tiltX, b.tiltX);
  const tiltY = value(a.tiltY, b.tiltY);
  if (pressure !== undefined) point.pressure = pressure;
  if (tiltX !== undefined) point.tiltX = tiltX;
  if (tiltY !== undefined) point.tiltY = tiltY;
  return point;
};

/** Distance between two points */
const distance = (a: BrushStrokePoint, b: BrushStrokePoint) =>
  Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Split a curve into short straight pieces about `CURVE_STEP` pixels long.
 *
 * @param at - position on the curve for t from 0 to 1
 * @param approxLength - rough curve length, used to choose how many pieces
 */
const flatten = (
  at: (t: number) => BrushStrokePoint,
  approxLength: number,
): BrushStrokePoint[] => {
  const pieces = Math.max(1, Math.ceil(approxLength / CURVE_STEP));
  const points: BrushStrokePoint[] = [];
  for (let i = 1; i <= pieces; i++) points.push(at(i / pieces));
  return points;
};

/**
 * Quadratic Bézier from `a` to `b` with control point `c`. Pressure and tilt blend from `a` to `b`.
 */
const quadratic = (
  a: BrushStrokePoint,
  c: BrushStrokePoint,
  b: BrushStrokePoint,
) =>
  flatten(
    (t) => {
      const point = mix(a, b, t);
      const u = 1 - t;
      point.x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
      point.y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
      return point;
    },
    distance(a, c) + distance(c, b),
  );

/**
 * Cubic Bézier from `a` to `b` with handles `c1` and `c2`. Pressure and tilt blend from `a` to `b`.
 */
const cubic = (
  a: BrushStrokePoint,
  c1: BrushStrokePoint,
  c2: BrushStrokePoint,
  b: BrushStrokePoint,
) =>
  flatten(
    (t) => {
      const point = mix(a, b, t);
      const u = 1 - t;
      point.x =
        u * u * u * a.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t * t * t * b.x;
      point.y =
        u * u * u * a.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t * t * t * b.y;
      return point;
    },
    distance(a, c1) + distance(c1, c2) + distance(c2, b),
  );

/**
 * The curve between `p1` and `p2` whose handles follow the direction of movement from `p0` to `p2` and from `p1` to `p3` (Catmull–Rom).
 */
const catmullRom = (
  p0: BrushStrokePoint,
  p1: BrushStrokePoint,
  p2: BrushStrokePoint,
  p3: BrushStrokePoint,
) =>
  cubic(
    p1,
    { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
    p2,
  );

/**
 * Builds a stroke's line from its recorded points and places stamps along it, `spacing` pixels apart. Works incrementally while drawing:
 * each new point returns the stamps that can now be placed.
 *
 * Smoothing:
 * - Linear (and None): straight lines between points.
 * - BezierQuad: quadratic curves through the midpoints between points (no lag).
 * - BezierCubic: cubic curves whose handles follow the direction of movement before and after each point (lags one point until the next arrives).
 *
 * @example
 * const path = new StrokePath(SmoothingType.Linear, 5);
 * path.add({ x: 0, y: 0 }); // [{ x: 0, y: 0 }]
 * path.add({ x: 10, y: 0 }); // [{ x: 5, y: 0 }, { x: 10, y: 0 }]
 * path.finish(); // []
 */
export default class StrokePath {
  /** Pixels between stamps */
  readonly step: number;

  private readonly smoothing: SmoothingType;

  private readonly points: BrushStrokePoint[] = [];

  /** End of the line built so far */
  private tip?: BrushStrokePoint;

  /** Distance along the line until the next stamp */
  private untilNext = 0;

  constructor(
    smoothing: SmoothingType = SmoothingType.Linear,
    spacing?: number,
  ) {
    this.smoothing = smoothing;
    this.step = stampStep(spacing);
  }

  /**
   * Add a recorded point. Returns the stamps placed along the line this point completes (the first point always gets a stamp).
   */
  add(point: BrushStrokePoint): BrushStrokePoint[] {
    const points = this.points;
    points.push(point);
    const n = points.length;
    if (n === 1) {
      this.tip = point;
      this.untilNext = this.step;
      return [point];
    }

    const prev = points[n - 2] as BrushStrokePoint;
    switch (this.smoothing) {
      case SmoothingType.BezierQuad:
        // First piece runs straight to the first midpoint; later pieces curve between midpoints
        return n === 2
          ? this.walk([mix(prev, point, 0.5)])
          : this.walk(
              quadratic(
                this.tip as BrushStrokePoint,
                prev,
                mix(prev, point, 0.5),
              ),
            );
      case SmoothingType.BezierCubic:
        // The curve into `prev` needs the point after it, so it is drawn one point late
        if (n === 2) return [];
        return this.walk(
          catmullRom(
            points[n - 4] ?? (points[n - 3] as BrushStrokePoint),
            points[n - 3] as BrushStrokePoint,
            prev,
            point,
          ),
        );
      default:
        return this.walk([point]);
    }
  }

  /**
   * Finish the stroke: returns stamps for the last part of the line that was waiting for more points.
   */
  finish(): BrushStrokePoint[] {
    const points = this.points;
    const n = points.length;
    const last = points[n - 1];
    if (!last || n < 2) return [];
    switch (this.smoothing) {
      case SmoothingType.BezierQuad:
        return this.walk([last]);
      case SmoothingType.BezierCubic:
        return this.walk(
          catmullRom(
            points[n - 3] ?? (points[n - 2] as BrushStrokePoint),
            points[n - 2] as BrushStrokePoint,
            last,
            last,
          ),
        );
      default:
        return [];
    }
  }

  /**
   * Extend the line through the given points and return stamps placed every `step` pixels along it.
   */
  private walk(points: BrushStrokePoint[]): BrushStrokePoint[] {
    const stamps: BrushStrokePoint[] = [];
    for (const next of points) {
      const from = this.tip as BrushStrokePoint;
      const length = distance(from, next);
      let travelled = 0;
      while (length - travelled >= this.untilNext) {
        travelled += this.untilNext;
        stamps.push(mix(from, next, travelled / length));
        this.untilNext = this.step;
      }
      this.untilNext -= length - travelled;
      this.tip = next;
    }
    return stamps;
  }
}
