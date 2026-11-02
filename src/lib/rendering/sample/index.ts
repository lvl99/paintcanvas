import type { CanvasFactory } from "../../classes/Layer";
import {
  CANVAS_BACKGROUND,
  drawLayers,
  type DrawableLayer,
} from "../compositing";

/** How many canvas pixels across the sampling window enlarges */
export const SAMPLE_PIXELS = 10;

/** How much the sampling window enlarges each canvas pixel */
export const SAMPLE_SCALE = 5;

/** The most pixels across that an area's average is worked out from while dragging (the final average uses them all) */
export const PREVIEW_MAX_PIXELS = 100;

/** A rectangle of whole canvas pixels */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Format a colour as `#rrggbb`.
 *
 * @example
 * toHex(255, 0, 128); // "#ff0080"
 */
export const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/**
 * The average colour of RGBA pixels, counting every pixel that isn't fully transparent (transparent pixels are outside
 * the canvas). Undefined if all are transparent.
 *
 * @example
 * averageColour(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255])); // "#800080"
 */
export const averageColour = (
  pixels: Uint8ClampedArray,
): string | undefined => {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    r += pixels[i] as number;
    g += pixels[i + 1] as number;
    b += pixels[i + 2] as number;
    count++;
  }
  return count > 0 ? toHex(r / count, g / count, b / count) : undefined;
};

/**
 * The whole canvas pixels a rectangle between two canvas points covers, cut to the canvas. Undefined if it's outside.
 *
 * @example
 * pixelRect({ x: 2.5, y: 8 }, { x: -3, y: 1.2 }, 100, 100); // { x: 0, y: 1, width: 3, height: 8 }
 */
export const pixelRect = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
): PixelRect | undefined => {
  const left = Math.max(0, Math.floor(Math.min(a.x, b.x)));
  const top = Math.max(0, Math.floor(Math.min(a.y, b.y)));
  const right = Math.min(canvasWidth, Math.floor(Math.max(a.x, b.x)) + 1);
  const bottom = Math.min(canvasHeight, Math.floor(Math.max(a.y, b.y)) + 1);
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * Draw an area of the canvas as it's shown (the white background, then every layer mixed as shown) onto a new canvas,
 * scaled to fit `width` × `height`. Parts outside the canvas stay transparent.
 *
 * @example
 * flattenArea(app.drawables, app.createCanvas, app.width, app.height, { x: 10, y: 10, width: 10, height: 10 });
 */
export const flattenArea = (
  layers: readonly DrawableLayer[],
  createCanvas: CanvasFactory,
  canvasWidth: number,
  canvasHeight: number,
  area: PixelRect,
  width = area.width,
  height = area.height,
): OffscreenCanvas => {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as OffscreenCanvasRenderingContext2D;
  const scaleX = width / area.width;
  const scaleY = height / area.height;
  ctx.setTransform(scaleX, 0, 0, scaleY, -area.x * scaleX, -area.y * scaleY);
  ctx.imageSmoothingEnabled = scaleX < 1 || scaleY < 1;
  ctx.fillStyle = CANVAS_BACKGROUND;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  drawLayers(ctx, layers);
  return canvas;
};

/**
 * Read all of a canvas's pixels as RGBA.
 */
export const readPixels = (canvas: OffscreenCanvas): Uint8ClampedArray =>
  (canvas.getContext("2d") as OffscreenCanvasRenderingContext2D).getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  ).data;
