import type { Point, Rect } from "../../classes/Viewport";

/** How a new shape combines with the existing mask */
export type MaskMode = "replace" | "add" | "subtract";

/** Distance (screen pixels) within which clicking the first polygon node closes the polygon */
export const CLOSE_DISTANCE = 8;

/**
 * Choose how a new shape combines with the mask from the keys held when it starts: Shift adds, Alt subtracts, otherwise it replaces.
 *
 * @example
 * maskModeFor({ shiftKey: true, altKey: false }); // "add"
 */
export const maskModeFor = ({
  shiftKey,
  altKey,
}: {
  shiftKey: boolean;
  altKey: boolean;
}): MaskMode => (altKey ? "subtract" : shiftKey ? "add" : "replace");

/**
 * Rectangle between two corner points, whichever way it was dragged. With `square`, the shorter side grows to match the longer one,
 * keeping the drag direction.
 *
 * @example
 * rectFromCorners({ x: 10, y: 10 }, { x: 0, y: 4 }); // { x: 0, y: 4, width: 10, height: 6 }
 */
export const rectFromCorners = (
  start: Point,
  end: Point,
  square = false,
): Rect => {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * size;
    dy = Math.sign(dy || 1) * size;
  }
  return {
    x: Math.min(start.x, start.x + dx),
    y: Math.min(start.y, start.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
};

/**
 * Snap a point so the line from `from` runs at a multiple of 45°, keeping the line's length along that direction.
 *
 * @example
 * snapAngle({ x: 0, y: 0 }, { x: 10, y: 1 }); // { x: 10, y: 0 }
 */
export const snapAngle = (from: Point, to: Point): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  // Round away floating-point noise so horizontal and vertical lines stay exact
  const round = (value: number) => Math.round(value * 1e9) / 1e9;
  return {
    x: round(from.x + Math.cos(angle) * length),
    y: round(from.y + Math.sin(angle) * length),
  };
};

/**
 * Check whether two points are within a distance of each other.
 *
 * @example
 * isNear({ x: 0, y: 0 }, { x: 3, y: 4 }, 5); // true
 */
export const isNear = (a: Point, b: Point, distance: number): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) <= distance;
