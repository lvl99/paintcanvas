import type Layer from "../../classes/Layer";
import type { Point, Rect } from "../../classes/Viewport";
import { createOffscreenCanvas, type CanvasFactory } from "../../classes/Layer";
import {
  chainSegments,
  traceOutline,
  type OutlineLoop,
} from "../../rendering/outline";
import type { MaskMode } from "../geometry";

/** A shape drawn with a lasso tool, in canvas pixels */
export type MaskShape =
  | { type: "rect"; rect: Rect }
  | { type: "ellipse"; rect: Rect }
  | { type: "polygon"; points: Point[] };

/** Canvas composite operation for each mask mode */
const OPERATIONS: Record<MaskMode, GlobalCompositeOperation> = {
  replace: "source-over",
  add: "source-over",
  subtract: "destination-out",
};

/**
 * Bounding box of a shape.
 */
export const shapeBounds = (shape: MaskShape): Rect => {
  if (shape.type !== "polygon") return shape.rect;
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/**
 * The current mask: a canvas-sized greyscale area (stored as alpha) that limits where drawing applies. Only ever local.
 *
 * Shapes and layer alpha replace, add to or subtract from it. After each change the mask is measured once to find whether it is
 * empty and to trace its outline (for the animated "crawling ants").
 *
 * Dispatches a `change` event whenever the mask changes.
 *
 * @example
 * selection.apply({ type: "rect", rect: { x: 10, y: 10, width: 100, height: 50 } }, "replace");
 * selection.active; // true
 * selection.outline; // closed loops in canvas pixels
 */
export default class Selection extends EventTarget {
  /** Canvas width in pixels */
  readonly width: number;

  /** Canvas height in pixels */
  readonly height: number;

  /** Whether a non-empty mask exists */
  active = false;

  /** Outline of the mask as closed loops in canvas pixels */
  outline: OutlineLoop[] = [];

  private readonly createCanvas: CanvasFactory;

  private maskCanvas?: OffscreenCanvas;

  /** Area that may contain masked pixels */
  private bounds?: Rect;

  constructor(
    width: number,
    height: number,
    createCanvas: CanvasFactory = createOffscreenCanvas,
  ) {
    super();
    this.width = width;
    this.height = height;
    this.createCanvas = createCanvas;
  }

  /** The mask canvas (alpha = mask value) while a mask is active, for limiting drawing */
  get mask(): OffscreenCanvas | undefined {
    return this.active ? this.maskCanvas : undefined;
  }

  /** The mask canvas's drawing context (creating the canvas on first use) */
  private get context(): OffscreenCanvasRenderingContext2D {
    this.maskCanvas ??= this.createCanvas(this.width, this.height);
    return this.maskCanvas.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
  }

  /**
   * Replace, add to or subtract from the mask with a lasso shape.
   */
  apply(shape: MaskShape, mode: MaskMode): void {
    this.draw(mode, shapeBounds(shape), (ctx) => {
      ctx.beginPath();
      if (shape.type === "rect") {
        ctx.rect(
          shape.rect.x,
          shape.rect.y,
          shape.rect.width,
          shape.rect.height,
        );
      } else if (shape.type === "ellipse") {
        const { x, y, width, height } = shape.rect;
        ctx.ellipse(
          x + width / 2,
          y + height / 2,
          width / 2,
          height / 2,
          0,
          0,
          Math.PI * 2,
        );
      } else {
        shape.points.forEach(({ x, y }, i) =>
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
        );
        ctx.closePath();
      }
      ctx.fill();
    });
  }

  /**
   * Move part of the mask along with transformed pixels: removes the piece from where it was and draws it at its new place.
   *
   * @param draw - draws the piece in its new place (e.g. `drawTransformed`)
   */
  moveArea(
    piece: OffscreenCanvas,
    from: Rect,
    to: Rect,
    draw: (ctx: OffscreenCanvasRenderingContext2D) => void,
  ): void {
    if (!this.active) return;
    const ctx = this.context;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(piece, from.x, from.y);
    ctx.globalCompositeOperation = "source-over";
    draw(ctx);
    ctx.restore();
    this.bounds = unionRect(this.bounds as Rect, to);
    this.measure();
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Mask the whole canvas ("cmd + a").
   */
  selectAll(): void {
    this.apply(
      {
        type: "rect",
        rect: { x: 0, y: 0, width: this.width, height: this.height },
      },
      "replace",
    );
  }

  /**
   * Invert the mask: masked parts become unmasked and the rest becomes masked. Without a mask, everything is masked.
   */
  invert(): void {
    if (!this.active) {
      this.selectAll();
      return;
    }
    // XOR with a full rectangle turns each pixel's mask value from a to 1 - a
    const ctx = this.context;
    ctx.save();
    ctx.globalCompositeOperation = "xor";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
    this.bounds = { x: 0, y: 0, width: this.width, height: this.height };
    this.measure();
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Mask a layer's visible pixels, following their alpha (Cmd/Ctrl + click a layer's name).
   */
  fromAlpha(layer: Layer, mode: MaskMode = "replace"): void {
    this.draw(
      mode,
      { x: 0, y: 0, width: this.width, height: this.height },
      (ctx) => {
        ctx.drawImage(layer.canvas, 0, 0);
      },
    );
  }

  /**
   * Remove the mask ("cmd + d").
   */
  clear(): void {
    if (this.maskCanvas) this.context.clearRect(0, 0, this.width, this.height);
    this.active = false;
    this.outline = [];
    this.bounds = undefined;
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Draw onto the mask with a mode's operation, then re-measure it.
   */
  private draw(
    mode: MaskMode,
    area: Rect,
    paint: (ctx: OffscreenCanvasRenderingContext2D) => void,
  ): void {
    if (mode === "subtract" && !this.active) return;
    const ctx = this.context;
    if (mode === "replace") ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.globalCompositeOperation = OPERATIONS[mode];
    ctx.fillStyle = "#000000";
    paint(ctx);
    ctx.restore();
    if (mode !== "subtract") {
      this.bounds =
        mode === "replace" || !this.bounds
          ? area
          : unionRect(this.bounds, area);
    }
    this.measure();
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Check whether the mask has any pixels and trace its outline, within its bounds.
   */
  private measure(): void {
    const area =
      this.bounds && clipToCanvas(this.bounds, this.width, this.height);
    if (!area) {
      this.active = false;
      this.outline = [];
      return;
    }
    const pixels = this.context.getImageData(
      area.x,
      area.y,
      area.width,
      area.height,
    ).data;
    const alpha = new Uint8ClampedArray(area.width * area.height);
    let any = false;
    for (let i = 0; i < alpha.length; i++) {
      const value = pixels[i * 4 + 3] as number;
      alpha[i] = value;
      if (value) any = true;
    }
    this.active = any;
    this.outline = any
      ? chainSegments(
          traceOutline(alpha, area.width, area.height, { normalise: false }),
        ).map((loop) =>
          loop.map((value, i) => value + (i % 2 === 0 ? area.x : area.y)),
        )
      : [];
  }
}

/**
 * Smallest rectangle containing both rectangles.
 */
const unionRect = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/**
 * Snap a rectangle outwards to whole pixels (with a 1 px margin for anti-aliasing) and clip it to the canvas.
 */
const clipToCanvas = (
  rect: Rect,
  width: number,
  height: number,
): Rect | undefined => {
  const x = Math.max(0, Math.floor(rect.x) - 1);
  const y = Math.max(0, Math.floor(rect.y) - 1);
  const right = Math.min(width, Math.ceil(rect.x + rect.width) + 1);
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height) + 1);
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : undefined;
};
