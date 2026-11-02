/** A point in screen (CSS pixel) or canvas (image pixel) coordinates */
export interface Point {
  x: number;
  y: number;
}

/** A rectangle in canvas pixels */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Space reserved on each side of the screen by the interface (e.g. toolbar and panels), in CSS pixels */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Zoom steps used by the zoom tool, from 1/16 to 32× */
export const ZOOM_LEVELS = [
  0.0625,
  0.125,
  0.25,
  1 / 3,
  0.5,
  2 / 3,
  1,
  1.5,
  2,
  3,
  4,
  6,
  8,
  12,
  16,
  24,
  32,
] as const;

/** Smallest zoom */
export const MIN_ZOOM: number = ZOOM_LEVELS[0];

/** Largest zoom */
export const MAX_ZOOM: number = ZOOM_LEVELS[ZOOM_LEVELS.length - 1] as number;

/** Screen space (CSS pixels) of canvas that must stay visible so it can't be panned out of reach */
export const MIN_VISIBLE = 64;

/** Space left around the canvas when fitting it to the screen, in CSS pixels */
export const FIT_PADDING = 24;

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Clamp a value between min and max.
 */
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * The user's view of the canvas: zoom level and position. Converts between screen and canvas coordinates.
 *
 * The canvas pixel at `(0, 0)` is drawn at screen position `(offsetX, offsetY)`, and one canvas pixel is `zoom` CSS pixels wide.
 *
 * Dispatches a `change` event whenever the view moves or zooms.
 *
 * @example
 * const view = new Viewport(2000, 2000);
 * view.resize(1280, 800);
 * view.fit();
 * view.zoomAt({ x: 640, y: 400 }, 2);
 * view.screenToCanvas({ x: 640, y: 400 }); // canvas point under the screen centre
 */
export default class Viewport extends EventTarget {
  /** Canvas width in pixels */
  readonly canvasWidth: number;

  /** Canvas height in pixels */
  readonly canvasHeight: number;

  /** Screen width in CSS pixels */
  width = 0;

  /** Screen height in CSS pixels */
  height = 0;

  /** CSS pixels per canvas pixel */
  zoom = 1;

  /** Screen X of the canvas's left edge */
  offsetX = 0;

  /** Screen Y of the canvas's top edge */
  offsetY = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    super();
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /**
   * Convert a screen point to canvas pixels.
   */
  screenToCanvas({ x, y }: Point): Point {
    return {
      x: (x - this.offsetX) / this.zoom,
      y: (y - this.offsetY) / this.zoom,
    };
  }

  /**
   * Convert a canvas point to screen (CSS) pixels.
   */
  canvasToScreen({ x, y }: Point): Point {
    return { x: x * this.zoom + this.offsetX, y: y * this.zoom + this.offsetY };
  }

  /**
   * The part of the canvas currently visible on screen, clipped to the canvas.
   */
  visibleRect(): Rect {
    const topLeft = this.screenToCanvas({ x: 0, y: 0 });
    const bottomRight = this.screenToCanvas({ x: this.width, y: this.height });
    const x = clamp(topLeft.x, 0, this.canvasWidth);
    const y = clamp(topLeft.y, 0, this.canvasHeight);
    return {
      x,
      y,
      width: clamp(bottomRight.x, 0, this.canvasWidth) - x,
      height: clamp(bottomRight.y, 0, this.canvasHeight) - y,
    };
  }

  /**
   * Set the screen size (e.g. when the window resizes). Keeps the view in reach.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.constrain();
    this.notify();
  }

  /**
   * Zoom and centre so the whole canvas fits in the space not covered by the interface (never zooming in past 100%).
   */
  fit(insets: Insets = NO_INSETS): void {
    const availableWidth = Math.max(
      1,
      this.width - insets.left - insets.right - FIT_PADDING * 2,
    );
    const availableHeight = Math.max(
      1,
      this.height - insets.top - insets.bottom - FIT_PADDING * 2,
    );
    this.zoom = clamp(
      Math.min(
        availableWidth / this.canvasWidth,
        availableHeight / this.canvasHeight,
        1,
      ),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    this.offsetX =
      insets.left +
      (this.width - insets.left - insets.right - this.canvasWidth * this.zoom) /
        2;
    this.offsetY =
      insets.top +
      (this.height -
        insets.top -
        insets.bottom -
        this.canvasHeight * this.zoom) /
        2;
    this.notify();
  }

  /**
   * Move the view so a canvas point is in the middle of the space not covered by the interface (e.g. clicking the canvas map).
   */
  centreOn({ x, y }: Point, insets: Insets = NO_INSETS): void {
    const centreX = insets.left + (this.width - insets.left - insets.right) / 2;
    const centreY = insets.top + (this.height - insets.top - insets.bottom) / 2;
    this.offsetX = centreX - x * this.zoom;
    this.offsetY = centreY - y * this.zoom;
    this.constrain();
    this.notify();
  }

  /**
   * Move the view by a distance in screen pixels (e.g. while dragging with the pan tool).
   */
  panBy(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
    this.constrain();
    this.notify();
  }

  /**
   * Zoom to a level, keeping the canvas point under `anchor` (a screen point) in place.
   */
  zoomAt(anchor: Point, zoom: number): void {
    const canvasPoint = this.screenToCanvas(anchor);
    this.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.offsetX = anchor.x - canvasPoint.x * this.zoom;
    this.offsetY = anchor.y - canvasPoint.y * this.zoom;
    this.constrain();
    this.notify();
  }

  /**
   * Zoom in one step around a screen point (zoom tool click).
   */
  zoomIn(anchor: Point): void {
    this.zoomAt(
      anchor,
      ZOOM_LEVELS.find((level) => level > this.zoom + 1e-9) ?? MAX_ZOOM,
    );
  }

  /**
   * Zoom out one step around a screen point (zoom tool Alt+click).
   */
  zoomOut(anchor: Point): void {
    this.zoomAt(
      anchor,
      [...ZOOM_LEVELS].reverse().find((level) => level < this.zoom - 1e-9) ??
        MIN_ZOOM,
    );
  }

  /**
   * Keep at least `MIN_VISIBLE` pixels of the canvas on screen in each direction.
   */
  private constrain(): void {
    const canvasScreenWidth = this.canvasWidth * this.zoom;
    const canvasScreenHeight = this.canvasHeight * this.zoom;
    const keepX = Math.min(MIN_VISIBLE, canvasScreenWidth);
    const keepY = Math.min(MIN_VISIBLE, canvasScreenHeight);
    this.offsetX = clamp(
      this.offsetX,
      keepX - canvasScreenWidth,
      this.width - keepX,
    );
    this.offsetY = clamp(
      this.offsetY,
      keepY - canvasScreenHeight,
      this.height - keepY,
    );
  }

  /**
   * Dispatch a `change` event.
   */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
