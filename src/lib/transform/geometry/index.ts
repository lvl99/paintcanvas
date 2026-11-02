import type { Point, Rect } from "../../classes/Viewport";

/**
 * Where and how transformed pixels are placed: the centre, size and rotation of the box they are drawn in.
 * Width and height are negative when the box has been flipped by dragging a handle past the opposite side.
 */
export interface TransformBox {
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** Rotation in degrees, clockwise */
  rotation: number;
}

/** A handle position relative to the box centre: -1, 0 or 1 along each axis (0, 0 is the centre) */
export interface Handle {
  hx: -1 | 0 | 1;
  hy: -1 | 0 | 1;
}

/** The 8 move & scale handles: corners and edge centres */
export const SCALE_HANDLES: readonly Handle[] = [
  { hx: -1, hy: -1 },
  { hx: 0, hy: -1 },
  { hx: 1, hy: -1 },
  { hx: -1, hy: 0 },
  { hx: 1, hy: 0 },
  { hx: -1, hy: 1 },
  { hx: 0, hy: 1 },
  { hx: 1, hy: 1 },
];

/** Distance (screen pixels) of the rotate handle beyond the top-centre handle */
export const ROTATE_HANDLE_DISTANCE = 24;

/** Degrees per rotation step when Shift is held */
export const ROTATION_STEP = 45;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Rotate a vector by an angle in degrees.
 */
const rotate = ({ x, y }: Point, degrees: number): Point => {
  const cos = Math.cos(toRadians(degrees));
  const sin = Math.sin(toRadians(degrees));
  return { x: x * cos - y * sin, y: x * sin + y * cos };
};

/**
 * The box that exactly covers a rectangle, unrotated.
 *
 * @example
 * boxFromRect({ x: 0, y: 0, width: 10, height: 20 }); // { cx: 5, cy: 10, width: 10, height: 20, rotation: 0 }
 */
export const boxFromRect = ({ x, y, width, height }: Rect): TransformBox => ({
  cx: x + width / 2,
  cy: y + height / 2,
  width,
  height,
  rotation: 0,
});

/**
 * Where a handle is on the canvas.
 */
export const handlePosition = (
  box: TransformBox,
  { hx, hy }: Handle,
): Point => {
  const offset = rotate(
    { x: (hx * box.width) / 2, y: (hy * box.height) / 2 },
    box.rotation,
  );
  return { x: box.cx + offset.x, y: box.cy + offset.y };
};

/**
 * The box's four corners in drawing order (top-left, top-right, bottom-right, bottom-left), for drawing its outline.
 */
export const boxCorners = (box: TransformBox): Point[] =>
  [
    { hx: -1, hy: -1 },
    { hx: 1, hy: -1 },
    { hx: 1, hy: 1 },
    { hx: -1, hy: 1 },
  ].map((h) => handlePosition(box, h as Handle));

/**
 * Where the rotate handle is, in screen units: `distance` beyond the top-centre handle, away from the box's centre, so it
 * turns with the box. Returns the handle and the top-centre handle (`anchor`) it is joined to by a line.
 *
 * @param toScreen - converts canvas points to screen points
 *
 * @example
 * rotateHandle({ cx: 50, cy: 50, width: 40, height: 20, rotation: 0 }); // { anchor: { x: 50, y: 40 }, handle: { x: 50, y: 16 } }
 */
export const rotateHandle = (
  box: TransformBox,
  toScreen: (p: Point) => Point = (p) => p,
  distance = ROTATE_HANDLE_DISTANCE,
): { anchor: Point; handle: Point } => {
  const anchor = toScreen(handlePosition(box, { hx: 0, hy: -1 }));
  const centre = toScreen({ x: box.cx, y: box.cy });
  let dx = anchor.x - centre.x;
  let dy = anchor.y - centre.y;
  let length = Math.hypot(dx, dy);
  // A box with no height: point up from the box, as it is turned
  if (length === 0) {
    ({ x: dx, y: dy } = rotate({ x: 0, y: -1 }, box.rotation));
    length = 1;
  }
  return {
    anchor,
    handle: {
      x: anchor.x + (dx / length) * distance,
      y: anchor.y + (dy / length) * distance,
    },
  };
};

/**
 * Find the handle under a point, if any. Points and radius are in the same units (usually screen pixels).
 *
 * @param toScreen - converts canvas points to the point's units
 */
export const handleAt = (
  box: TransformBox,
  handles: readonly Handle[],
  point: Point,
  radius: number,
  toScreen: (p: Point) => Point = (p) => p,
): Handle | undefined =>
  handles.find((handle) => {
    const position = toScreen(handlePosition(box, handle));
    return Math.hypot(position.x - point.x, position.y - point.y) <= radius;
  });

/**
 * Check whether a canvas point is inside the (possibly rotated) box.
 */
export const isInsideBox = (box: TransformBox, point: Point): boolean => {
  const local = rotate(
    { x: point.x - box.cx, y: point.y - box.cy },
    -box.rotation,
  );
  return (
    Math.abs(local.x) <= Math.abs(box.width) / 2 &&
    Math.abs(local.y) <= Math.abs(box.height) / 2
  );
};

/**
 * Move the box by a distance. With `constrain` (Shift), it only moves along the axis it has moved furthest on.
 *
 * @param start - the box when the drag started
 */
export const moveBox = (
  start: TransformBox,
  dx: number,
  dy: number,
  constrain: boolean,
): TransformBox => {
  if (constrain) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  return { ...start, cx: start.cx + dx, cy: start.cy + dy };
};

/**
 * Scale the box by dragging a handle to a point, keeping the opposite side (or corner) fixed. Works on rotated boxes.
 * With `proportional` (Shift), the box keeps the original's proportions; edge handles then scale the other axis around its centre.
 *
 * @param start - the box when the drag started
 * @param aspect - original width ÷ height, kept when proportional
 */
export const scaleBox = (
  start: TransformBox,
  handle: Handle,
  point: Point,
  proportional: boolean,
  aspect: number,
): TransformBox => {
  const { hx, hy } = handle;
  const anchor = handlePosition(start, {
    hx: (-hx || 0) as Handle["hx"],
    hy: (-hy || 0) as Handle["hy"],
  });
  const local = rotate(
    { x: point.x - anchor.x, y: point.y - anchor.y },
    -start.rotation,
  );
  let width = hx !== 0 ? hx * local.x : start.width;
  let height = hy !== 0 ? hy * local.y : start.height;

  if (proportional) {
    const sign = (value: number) => (value < 0 ? -1 : 1);
    if (hx !== 0 && hy !== 0) {
      // Corners: follow whichever side was dragged further, relative to the original proportions
      if (Math.abs(width) / aspect >= Math.abs(height))
        height = (sign(height) * Math.abs(width)) / aspect;
      else width = sign(width) * Math.abs(height) * aspect;
    } else if (hx !== 0) {
      height = (sign(start.height) * Math.abs(width)) / aspect;
    } else {
      width = sign(start.width) * Math.abs(height) * aspect;
    }
  }

  // Centre is half the new size away from the anchor, along each scaled axis
  const centreOffset = rotate(
    {
      x: hx !== 0 ? (hx * width) / 2 : 0,
      y: hy !== 0 ? (hy * height) / 2 : 0,
    },
    start.rotation,
  );
  return {
    ...start,
    cx: anchor.x + centreOffset.x,
    cy: anchor.y + centreOffset.y,
    width,
    height,
  };
};

/**
 * Rotate the box around its centre by how far the pointer has turned around it since the drag started.
 * With `snap` (Shift), the rotation is a multiple of 45°.
 *
 * @param start - the box when the drag started
 * @param from - pointer position when the drag started
 */
export const rotateBox = (
  start: TransformBox,
  from: Point,
  to: Point,
  snap: boolean,
): TransformBox => {
  const angle = (p: Point) =>
    (Math.atan2(p.y - start.cy, p.x - start.cx) * 180) / Math.PI;
  let rotation = start.rotation + angle(to) - angle(from);
  if (snap) rotation = Math.round(rotation / ROTATION_STEP) * ROTATION_STEP;
  // Keep within -180–180
  rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return { ...start, rotation };
};

/**
 * CSS resize cursor for a handle, taking the box's rotation into account.
 *
 * @example
 * resizeCursor({ hx: 1, hy: 0 }, 0); // "ew-resize"
 */
export const resizeCursor = ({ hx, hy }: Handle, rotation: number): string => {
  const direction =
    ((((Math.atan2(hy, hx) * 180) / Math.PI + rotation) % 180) + 180) % 180;
  const cursors = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];
  return cursors[Math.round(direction / 45) % 4] as string;
};

/**
 * Smallest unrotated rectangle containing the box (e.g. the area the transformed pixels now cover).
 */
export const boxBounds = (box: TransformBox): Rect => {
  const corners = boxCorners(box);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};
