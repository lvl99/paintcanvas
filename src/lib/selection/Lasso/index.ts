import type { Point } from "../../classes/Viewport";
import type { MaskShape } from "../Selection";
import {
  isNear,
  maskModeFor,
  rectFromCorners,
  snapAngle,
  type MaskMode,
} from "../geometry";

/** The lasso tools */
export type LassoKind = "rectangle" | "circle" | "polygon" | "freeform";

/** Modifier keys held during a lasso action */
export interface LassoKeys {
  shiftKey: boolean;
  altKey: boolean;
}

/** What a finished lasso action does to the mask */
export type LassoResult =
  { shape: MaskShape; mode: MaskMode } | { deselect: true } | undefined;

/** A lasso shape in progress */
interface Drawing {
  kind: LassoKind;
  mode: MaskMode;
  start: Point;
  /** Polygon nodes or freeform path */
  points: Point[];
  /** Pointer position (snapped or constrained as needed) */
  current: Point;
  /** Whether rectangle/circle sizes are kept equal */
  constrain: boolean;
}

/** Smallest freeform distance between recorded points, in canvas pixels */
const FREEFORM_STEP = 1;

/**
 * Lasso tool behaviour, independent of the screen: builds rectangle, circle, polygon and freeform mask shapes from pointer input.
 *
 * - The keys held when a shape starts choose the mode: Shift adds, Alt subtracts, otherwise it replaces.
 * - Rectangle/circle: drag; Shift while dragging keeps sides equal. A click without dragging deselects (in replace mode).
 * - Polygon: click to add nodes; Shift snaps the next line to 45°; clicking near the first node, double-clicking or `close()` finishes it.
 * - Freeform: drag; releasing finishes it.
 * - `cancel()` (Escape) abandons the shape in progress.
 *
 * @example
 * lasso.down("rectangle", { x: 10, y: 10 }, keys, false);
 * lasso.move({ x: 50, y: 30 }, keys);
 * const result = lasso.up({ x: 50, y: 30 }); // { shape: { type: "rect", ... }, mode: "replace" }
 */
export default class Lasso extends EventTarget {
  private drawing?: Drawing;

  /** Whether a shape is in progress */
  get active(): boolean {
    return this.drawing !== undefined;
  }

  /** The shape in progress, for drawing its outline: rectangles/ellipses, or the polygon/freeform path including the pointer */
  get preview(): MaskShape | undefined {
    const d = this.drawing;
    if (!d) return undefined;
    switch (d.kind) {
      case "rectangle":
        return {
          type: "rect",
          rect: rectFromCorners(d.start, d.current, d.constrain),
        };
      case "circle":
        return {
          type: "ellipse",
          rect: rectFromCorners(d.start, d.current, d.constrain),
        };
      case "polygon":
        return { type: "polygon", points: [...d.points, d.current] };
      default:
        return { type: "polygon", points: d.points };
    }
  }

  /** Polygon nodes placed so far (for drawing handles) */
  get nodes(): readonly Point[] {
    return this.drawing?.kind === "polygon" ? this.drawing.points : [];
  }

  /**
   * Pointer pressed.
   *
   * @param nearFirstNode - whether the pointer is within closing distance of the polygon's first node (on screen)
   */
  down(
    kind: LassoKind,
    point: Point,
    keys: LassoKeys,
    nearFirstNode: boolean,
  ): LassoResult {
    const d = this.drawing;
    if (d?.kind === "polygon" && kind === "polygon") {
      if (nearFirstNode && d.points.length >= 3) return this.close();
      d.points.push(d.current);
      this.notify();
      return undefined;
    }
    this.drawing = {
      kind,
      mode: maskModeFor(keys),
      start: point,
      points: [point],
      current: point,
      constrain: false,
    };
    this.notify();
    return undefined;
  }

  /**
   * Pointer moved (with or without the button held).
   */
  move(point: Point, keys: LassoKeys): void {
    const d = this.drawing;
    if (!d) return;
    if (d.kind === "polygon") {
      d.current = keys.shiftKey
        ? snapAngle(d.points.at(-1) as Point, point)
        : point;
    } else {
      d.current = point;
      d.constrain = keys.shiftKey;
      const last = d.points.at(-1) as Point;
      if (d.kind === "freeform" && !isNear(last, point, FREEFORM_STEP))
        d.points.push(point);
    }
    this.notify();
  }

  /**
   * Pointer released: finishes rectangle, circle and freeform shapes. Polygons continue until closed.
   */
  up(
    point: Point,
    keys: LassoKeys = { shiftKey: false, altKey: false },
  ): LassoResult {
    const d = this.drawing;
    if (!d || d.kind === "polygon") return undefined;
    this.move(point, keys);
    if (d.kind === "freeform") return this.close();
    this.drawing = undefined;
    this.notify();
    const shape = this.shapeFrom(d);
    if (shape) return { shape, mode: d.mode };
    return d.mode === "replace" ? { deselect: true } : undefined;
  }

  /**
   * Finish a polygon or freeform shape (double-click, Enter, or clicking the first node). Shapes with fewer than three points are abandoned.
   */
  close(): LassoResult {
    const d = this.drawing;
    if (!d) return undefined;
    this.drawing = undefined;
    this.notify();
    // Drop a final node that repeats the previous one (a double-click adds a node before closing)
    const points = d.points.filter(
      (p, i) => i === 0 || !isNear(p, d.points[i - 1] as Point, 0.5),
    );
    return points.length >= 3
      ? { shape: { type: "polygon", points }, mode: d.mode }
      : undefined;
  }

  /**
   * Abandon the shape in progress (Escape).
   */
  cancel(): void {
    if (!this.drawing) return;
    this.drawing = undefined;
    this.notify();
  }

  /**
   * Turn a finished rectangle or circle into a shape, or undefined if it has no size.
   */
  private shapeFrom(d: Drawing): MaskShape | undefined {
    const rect = rectFromCorners(d.start, d.current, d.constrain);
    if (rect.width < 1 || rect.height < 1) return undefined;
    return d.kind === "circle"
      ? { type: "ellipse", rect }
      : { type: "rect", rect };
  }

  /**
   * Dispatch a `change` event (so the outline in progress redraws).
   */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
