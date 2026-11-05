/** How far (in pixels) a press must move before it counts as a drag, where a press can also be a tap */
export const DRAG_THRESHOLD = 4;

/** A pointer position in the viewport */
interface Point {
  x: number;
  y: number;
}

/**
 * How much a pointer moved between two points as one value: right and up are positive, left and down negative.
 *
 * @example
 * dragDelta({ x: 0, y: 0 }, { x: 5, y: -5 }); // 10
 */
export const dragDelta = (from: Point, to: Point): number =>
  to.x - from.x + (from.y - to.y);

/**
 * Turns pressing and dragging on an element into changes of a value: dragging right or up gives positive deltas, left
 * or down negative ones (see `dragDelta`). With a `threshold`, the press only becomes a drag once the pointer has moved
 * that far from where it was pressed, so a press that barely moves can still be a tap (e.g. to focus a field).
 *
 * The element is given the pointer while dragging, so the drag carries on outside it.
 *
 * @example
 * const drag = new PointerDrag((delta) => brush.resize(delta));
 * html`<div @pointerdown=${drag.start} @pointermove=${drag.move} @pointerup=${drag.end} @pointercancel=${drag.end}></div>`
 */
export class PointerDrag {
  private readonly onDelta: (delta: number) => void;

  private readonly threshold: number;

  /** Where the press started */
  private origin: Point | null = null;

  /** The last position a delta was given from, once dragging */
  private last: Point | null = null;

  constructor(onDelta: (delta: number) => void, threshold = 0) {
    this.onDelta = onDelta;
    this.threshold = threshold;
  }

  /** Whether the press has become a drag */
  get dragging(): boolean {
    return this.last !== null;
  }

  /**
   * Start a press (on `pointerdown`).
   */
  readonly start = (event: PointerEvent): void => {
    this.origin = { x: event.clientX, y: event.clientY };
    this.last = this.threshold > 0 ? null : this.origin;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  };

  /**
   * Give the change since the last move, once the press has become a drag (on `pointermove`).
   */
  readonly move = (event: PointerEvent): void => {
    if (!this.origin) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!this.last) {
      const distance = Math.hypot(
        point.x - this.origin.x,
        point.y - this.origin.y,
      );
      if (distance < this.threshold) return;
      this.last = this.origin;
      // Stop the browser selecting text or focusing while dragging
      event.preventDefault();
    }
    const delta = dragDelta(this.last, point);
    this.last = point;
    if (delta !== 0) this.onDelta(delta);
  };

  /**
   * End the press (on `pointerup` or `pointercancel`). Returns whether it was a drag.
   */
  readonly end = (): boolean => {
    const dragged = this.dragging;
    this.origin = null;
    this.last = null;
    return dragged;
  };
}
