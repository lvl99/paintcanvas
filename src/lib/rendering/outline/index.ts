/** A line from (x1, y1) to (x2, y2), in coordinates from 0 to 1 across the shape (or pixels, if not normalised) */
export type OutlineSegment = [x1: number, y1: number, x2: number, y2: number];

/** Options for tracing an outline */
export interface TraceOptions {
  /** Alpha value (0–255) at or above which a pixel is inside */
  threshold?: number;
  /** Return coordinates from 0 to 1 (default) or in pixels */
  normalise?: boolean;
  /** Only trace within this pixel area (e.g. the mask's bounding box) */
  bounds?: { x: number; y: number; width: number; height: number };
}

/**
 * Trace the outline of a shape from its alpha values (marching squares). Pixels at or above the threshold are inside.
 * Returns line segments in coordinates from 0 to 1 (so the outline can be drawn at any size), or in pixels.
 * Outline points lie halfway between pixel centres, so in pixels they are always whole or half numbers.
 *
 * @param alpha - one alpha value (0–255) per pixel, row by row
 *
 * @example
 * traceOutline(new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 0, 0]), 3, 3); // segments around the centre pixel
 */
export const traceOutline = (
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  { threshold = 128, normalise = true, bounds }: TraceOptions = {},
): OutlineSegment[] => {
  const inside = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    (alpha[y * width + x] as number) >= threshold;
  const segments: OutlineSegment[] = [];
  const scaleX = normalise ? width : 1;
  const scaleY = normalise ? height : 1;
  const add = (x1: number, y1: number, x2: number, y2: number) =>
    segments.push([x1 / scaleX, y1 / scaleY, x2 / scaleX, y2 / scaleY]);
  const fromX = bounds ? Math.max(-1, bounds.x - 1) : -1;
  const fromY = bounds ? Math.max(-1, bounds.y - 1) : -1;
  const toX = bounds ? Math.min(width, bounds.x + bounds.width) : width;
  const toY = bounds ? Math.min(height, bounds.y + bounds.height) : height;

  // Walk every 2×2 cell of pixel centres (including a border outside the image) and connect edge midpoints
  for (let y = fromY; y < toY; y++) {
    for (let x = fromX; x < toX; x++) {
      const tl = inside(x, y);
      const tr = inside(x + 1, y);
      const br = inside(x + 1, y + 1);
      const bl = inside(x, y + 1);
      const cell = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (cell === 0 || cell === 15) continue;
      // Edge midpoints in pixel-edge coordinates (pixel centre of (x, y) is at x + 0.5)
      const top = [x + 1, y + 0.5] as const;
      const right = [x + 1.5, y + 1] as const;
      const bottom = [x + 1, y + 1.5] as const;
      const left = [x + 0.5, y + 1] as const;
      const line = (
        a: readonly [number, number],
        b: readonly [number, number],
      ) => add(a[0], a[1], b[0], b[1]);
      switch (cell) {
        case 1:
        case 14:
          line(left, bottom);
          break;
        case 2:
        case 13:
          line(bottom, right);
          break;
        case 3:
        case 12:
          line(left, right);
          break;
        case 4:
        case 11:
          line(top, right);
          break;
        case 6:
        case 9:
          line(top, bottom);
          break;
        case 7:
        case 8:
          line(left, top);
          break;
        case 5:
          line(left, top);
          line(bottom, right);
          break;
        case 10:
          line(top, right);
          line(left, bottom);
          break;
      }
    }
  }
  return segments;
};

/** A closed outline as a list of points, `[x0, y0, x1, y1, ...]` */
export type OutlineLoop = number[];

/**
 * Join outline segments into closed loops, so dashed lines flow continuously along the outline. Straight runs are merged into single lines.
 *
 * @example
 * chainSegments(traceOutline(alpha, width, height, { normalise: false }));
 */
export const chainSegments = (
  segments: readonly OutlineSegment[],
): OutlineLoop[] => {
  const key = (x: number, y: number) => `${x},${y}`;
  // Each outline point is shared by exactly two segments
  const ends = new Map<string, number[]>();
  segments.forEach(([x1, y1, x2, y2], i) => {
    for (const k of [key(x1, y1), key(x2, y2)]) {
      const list = ends.get(k);
      if (list) list.push(i);
      else ends.set(k, [i]);
    }
  });

  const used = new Uint8Array(segments.length);
  const loops: OutlineLoop[] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const [sx, sy, ex, ey] = segments[start] as OutlineSegment;
    const loop = [sx, sy];
    let x = ex;
    let y = ey;
    for (;;) {
      // Drop the previous point when it lies on a straight line between its neighbours
      const n = loop.length;
      if (n >= 4) {
        const ax = loop[n - 4] as number;
        const ay = loop[n - 3] as number;
        const bx = loop[n - 2] as number;
        const by = loop[n - 1] as number;
        if ((bx - ax) * (y - ay) === (by - ay) * (x - ax)) loop.length -= 2;
      }
      loop.push(x, y);
      // Every outline point was added to the map above
      const next = (ends.get(key(x, y)) as number[]).find((i) => !used[i]);
      if (next === undefined) break;
      used[next] = 1;
      const [x1, y1, x2, y2] = segments[next] as OutlineSegment;
      [x, y] = x1 === x && y1 === y ? [x2, y2] : [x1, y1];
    }
    loops.push(loop);
  }
  return loops;
};
