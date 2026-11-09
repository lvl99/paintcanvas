// Profile graphs: curves that shape how an input (pen pressure, pen tilt or a random number) moves a brush setting
// between its min and max, e.g. so a light touch changes the size a lot and a heavy one only a little.

/** How the curve runs through a point (a plain object, not an enum, so schemas can use it in scripts run by Node) */
export const Interpolation = {
  /** A sharp corner: straight towards the points either side */
  Linear: "linear",
  /** A smooth curve through the point */
  BezierCubic: "bezier-cubic",
} as const;

/** How the curve runs through a point: `Interpolation.Linear` or `Interpolation.BezierCubic` */
export type Interpolation = (typeof Interpolation)[keyof typeof Interpolation];

/**
 * A point on a profile graph, in grid units: `x` from 0 (no input) to 10 (full input), `y` from -10 (the setting's min)
 * to 0 (its max), and how the curve runs through it (`i`).
 */
export interface ProfilePoint {
  x: number;
  y: number;
  i: Interpolation;
}

/** A named profile graph */
export interface ProfileGraph {
  /** Kebab-case for presets (e.g. "overweight"), a UUID for the user's own */
  id: string;
  name: string;
  /** Its points from left to right; the first is at x = 0 and the last at x = 10 */
  points: ProfilePoint[];
}

/** How many grid units the graph is across and up */
export const GRID_UNITS = 10;

/** Most points a profile graph can have */
export const MAX_PROFILE_POINTS = 32;

/** The ID of the straight-line preset, which changes nothing (the default) */
export const LINEAR_PROFILE_ID = "linear";

/** The profile graphs PaintCanvas comes with: Linear, Overweight and Underweight */
export const PROFILE_PRESETS: readonly ProfileGraph[] = [
  {
    id: LINEAR_PROFILE_ID,
    name: "Linear",
    points: [
      { x: 0, y: -10, i: Interpolation.Linear },
      { x: 10, y: 0, i: Interpolation.Linear },
    ],
  },
  {
    id: "overweight",
    name: "Overweight",
    points: [
      { x: 0, y: -10, i: Interpolation.Linear },
      { x: 3, y: -3, i: Interpolation.BezierCubic },
      { x: 10, y: 0, i: Interpolation.Linear },
    ],
  },
  {
    id: "underweight",
    name: "Underweight",
    points: [
      { x: 0, y: -10, i: Interpolation.Linear },
      { x: 7, y: -7, i: Interpolation.BezierCubic },
      { x: 10, y: 0, i: Interpolation.Linear },
    ],
  },
];

/**
 * A copy of the Linear preset's points, e.g. for a new graph.
 */
export const linearPoints = (): ProfilePoint[] =>
  (PROFILE_PRESETS[0] as ProfileGraph).points.map((point) => ({ ...point }));

/**
 * Whether two lists of points are the same.
 *
 * @example
 * samePoints(linearPoints(), linearPoints()); // true
 */
export const samePoints = (
  a: readonly ProfilePoint[],
  b: readonly ProfilePoint[],
): boolean =>
  a.length === b.length &&
  a.every(
    (point, index) =>
      point.x === b[index]?.x &&
      point.y === b[index]?.y &&
      point.i === b[index]?.i,
  );

/** Whether a list of points draws a straight line from the setting's min to its max, which changes nothing */
export const isLinear = (points: readonly ProfilePoint[]): boolean =>
  samePoints(points, linearPoints());

/**
 * The slope a segment of the curve leaves (or reaches) a point with: the segment's own slope at a sharp corner, or the
 * slope between the points either side at a smooth point (the slope between the segment's ends at the first and last).
 */
const slopeAt = (
  points: readonly ProfilePoint[],
  index: number,
  segmentSlope: number,
): number => {
  const point = points[index] as ProfilePoint;
  const before = points[index - 1];
  const after = points[index + 1];
  if (point.i === Interpolation.Linear || !before || !after)
    return segmentSlope;
  // The neighbours are never at the same x here: the point would be too, and segments with no width aren't curved
  return (after.y - before.y) / (after.x - before.x);
};

/**
 * Where the curve is (in grid units, -10 to 0) at an x in grid units (0 to 10). Between two points it's a cubic curve
 * that leaves and reaches each with its slope (see `slopeAt`), so it's a straight line between two sharp corners.
 */
export const profileY = (
  points: readonly ProfilePoint[],
  x: number,
): number => {
  const last = points.length - 1;
  let index = 0;
  while (index < last - 1 && (points[index + 1] as ProfilePoint).x < x) index++;
  const a = points[index] as ProfilePoint;
  const b = (points[index + 1] ?? a) as ProfilePoint;
  const width = b.x - a.x;
  if (width <= 0) return x < a.x ? a.y : b.y;
  const segmentSlope = (b.y - a.y) / width;
  const startSlope = slopeAt(points, index, segmentSlope) * width;
  const endSlope = slopeAt(points, index + 1, segmentSlope) * width;
  const t = Math.min(1, Math.max(0, (x - a.x) / width));
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a.y +
    (t3 - 2 * t2 + t) * startSlope +
    (-2 * t3 + 3 * t2) * b.y +
    (t3 - t2) * endSlope
  );
};

/**
 * Shape an input (0–1) with a profile graph: how far between the setting's min (0) and max (1) it puts it. Without
 * points, the input is used as it is. The result is kept within 0–1.
 *
 * @example
 * applyProfile(undefined, 0.3); // 0.3
 * applyProfile(PROFILE_PRESETS[1].points, 0.3); // 0.7 (Overweight: a light touch goes most of the way)
 */
export const applyProfile = (
  points: readonly ProfilePoint[] | undefined,
  input: number,
): number => {
  const amount = Math.min(1, Math.max(0, input));
  if (!points || points.length < 2) return amount;
  const y = profileY(points, amount * GRID_UNITS);
  return Math.min(1, Math.max(0, (y + GRID_UNITS) / GRID_UNITS));
};
