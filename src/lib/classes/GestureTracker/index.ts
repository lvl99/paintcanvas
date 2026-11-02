import type { Point } from "../Viewport";
import type { TouchGesture } from "../../utils/gestures";

/** A tap's fingers must all lift within this long of the first touching down */
export const TAP_MAX_MS = 300;

/** How far a finger can move and still be tapping (screen pixels); two-finger pan and pinch wait until a finger moves further */
export const TAP_SLOP_PX = 10;

/** How far three fingers must move together, or spread apart or close together, to swipe (screen pixels) */
export const SWIPE_MIN_PX = 40;

/**
 * The swipe three fingers made from where they were to where they are: in or out if their spread changed more than
 * they moved together, otherwise left, right, up or down (whichever way they moved most). Undefined if they moved less
 * than `SWIPE_MIN_PX`.
 *
 * @example
 * swipeOf([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], [{ x: 50, y: 0 }, { x: 60, y: 0 }, { x: 70, y: 0 }]); // "swipeRight3"
 */
export const swipeOf = (
  from: readonly Point[],
  to: readonly Point[],
): TouchGesture | undefined => {
  const centre = (points: readonly Point[]): Point => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  });
  const spread = (points: readonly Point[]): number => {
    const c = centre(points);
    return (
      points.reduce((sum, p) => sum + Math.hypot(p.x - c.x, p.y - c.y), 0) /
      points.length
    );
  };
  const a = centre(from);
  const b = centre(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const moved = Math.hypot(dx, dy);
  const spreadChange = spread(to) - spread(from);
  if (Math.abs(spreadChange) > moved) {
    if (Math.abs(spreadChange) < SWIPE_MIN_PX) return undefined;
    return spreadChange > 0 ? "swipeOut3" : "swipeIn3";
  }
  if (moved < SWIPE_MIN_PX) return undefined;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "swipeRight3" : "swipeLeft3";
  return dy > 0 ? "swipeDown3" : "swipeUp3";
};

/**
 * Recognises touch gestures from the fingers on the canvas, from the first finger down to the last one up: a tap with
 * two or three fingers (all lifted within `TAP_MAX_MS`, none moving more than `TAP_SLOP_PX`), or a swipe with three
 * fingers (see `swipeOf`, measured from when the third finger touched down to when the first of them lifted). Four or
 * more fingers, or a cancelled touch (e.g. taken by a system gesture), make no gesture.
 *
 * @example
 * const tracker = new GestureTracker();
 * tracker.down(1, { x: 0, y: 0 }, 0);
 * tracker.down(2, { x: 50, y: 0 }, 10);
 * tracker.up(1, 100);
 * tracker.up(2, 120); // "tap2"
 */
export default class GestureTracker {
  /** Where each finger on the screen touched down, and where it is now */
  private readonly fingers = new Map<number, { start: Point; now: Point }>();

  /** When the first finger touched down */
  private startTime = 0;

  /** Most fingers down at once */
  private most = 0;

  /** Whether any finger moved too far to tap */
  private moved = false;

  /** Whether a touch was cancelled */
  private cancelled = false;

  /** The three fingers' positions when the third touched down, and when the first of them lifted */
  private swipe?: { from: Point[]; to?: Point[] };

  /** How many fingers are on the screen */
  get count(): number {
    return this.fingers.size;
  }

  /**
   * Whether any finger moved further than a tap allows since touching down.
   */
  get dragging(): boolean {
    return this.moved;
  }

  /** A finger touched down */
  down(id: number, point: Point, time: number): void {
    if (this.fingers.size === 0) this.reset(time);
    this.fingers.set(id, { start: point, now: point });
    this.most = Math.max(this.most, this.fingers.size);
    if (this.fingers.size === 3)
      this.swipe = { from: [...this.fingers.values()].map((f) => f.now) };
  }

  /** A finger moved */
  move(id: number, point: Point): void {
    const finger = this.fingers.get(id);
    if (!finger) return;
    finger.now = point;
    if (
      Math.hypot(point.x - finger.start.x, point.y - finger.start.y) >
      TAP_SLOP_PX
    )
      this.moved = true;
  }

  /**
   * A finger lifted. Returns the gesture made once the last finger lifts, if any.
   */
  up(id: number, time: number): TouchGesture | undefined {
    if (!this.fingers.has(id)) return undefined;
    if (this.swipe && !this.swipe.to)
      this.swipe.to = [...this.fingers.values()].map((f) => f.now);
    this.fingers.delete(id);
    if (this.fingers.size > 0 || this.cancelled || this.most > 3)
      return undefined;
    if (this.most === 3 && this.swipe?.to) {
      const swipe = swipeOf(this.swipe.from, this.swipe.to);
      if (swipe) return swipe;
    }
    if (this.moved || time - this.startTime > TAP_MAX_MS) return undefined;
    if (this.most === 2) return "tap2";
    if (this.most === 3) return "tap3";
    return undefined;
  }

  /** A touch was cancelled: no gesture until all fingers have lifted */
  cancel(id: number): void {
    if (!this.fingers.delete(id)) return;
    this.cancelled = true;
  }

  /** Start tracking a new gesture */
  private reset(time: number): void {
    this.startTime = time;
    this.most = 0;
    this.moved = false;
    this.cancelled = false;
    this.swipe = undefined;
  }
}
