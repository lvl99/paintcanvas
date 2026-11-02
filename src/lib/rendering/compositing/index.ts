import type Layer from "../../classes/Layer";
import type Viewport from "../../classes/Viewport";
import type { Rect } from "../../classes/Viewport";

/** Colour of the canvas itself (the "paper") */
export const CANVAS_BACKGROUND = "#ffffff";

/** Colour of the area around the canvas */
export const PASTEBOARD_COLOUR = "#808080";

/** Anything drawn like a layer: the user's own layers, and drawings from elsewhere (external sheets) */
export type DrawableLayer = Pick<
  Layer,
  "visible" | "opacity" | "blendMode" | "canvas"
>;

/** A layer image to draw in place of a layer's own canvas (e.g. the layer with the stroke in progress) */
export interface LayerOverride {
  layer: DrawableLayer;
  image: CanvasImageSource;
}

/** The 2D drawing operations used for compositing; satisfied by both on-screen and offscreen canvas contexts */
export type DrawingContext = Pick<
  CanvasRenderingContext2D,
  | "setTransform"
  | "fillRect"
  | "drawImage"
  | "save"
  | "restore"
  | "fillStyle"
  | "globalAlpha"
  | "globalCompositeOperation"
  | "imageSmoothingEnabled"
  | "beginPath"
  | "rect"
  | "clip"
>;

/**
 * Draw layers onto a context that is already transformed to canvas coordinates, from the bottom layer to the top.
 *
 * Hidden and fully transparent layers are skipped. Each layer uses its opacity and blend mode.
 *
 * @param layers - layers from top (index 0) to bottom, as `LayerStack.layers` lists them
 * @param override - draw this image instead of one layer's canvas (the stroke preview)
 * @param area - draw only this area of each layer (canvas pixels), in place
 */
export const drawLayers = (
  ctx: DrawingContext,
  layers: readonly DrawableLayer[],
  override?: LayerOverride,
  area?: Rect,
): void => {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i] as DrawableLayer;
    if (!layer.visible || layer.opacity === 0) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    const image = override?.layer === layer ? override.image : layer.canvas;
    if (area) {
      const { x, y, width, height } = area;
      ctx.drawImage(image, x, y, width, height, x, y, width, height);
    } else ctx.drawImage(image, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
};

/**
 * Draw the canvas onto a context of any size, scaled to fit exactly: white background, then all layers.
 * Used for the canvas map, thumbnails and screenshots.
 *
 * @param override - draw this image instead of one layer's canvas (e.g. a transform in progress)
 *
 * @example
 * drawFlattened(mapContext, layers, 2000, 2000, 90, 90);
 */
export const drawFlattened = (
  ctx: DrawingContext,
  layers: readonly DrawableLayer[],
  canvasWidth: number,
  canvasHeight: number,
  targetWidth: number,
  targetHeight: number,
  override?: LayerOverride,
): void => {
  ctx.save();
  ctx.setTransform(
    targetWidth / canvasWidth,
    0,
    0,
    targetHeight / canvasHeight,
    0,
    0,
  );
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = CANVAS_BACKGROUND;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  drawLayers(ctx, layers, override);
  ctx.restore();
};

/**
 * The screen pixels (device pixels) showing an area of the canvas, rounded outwards with one more pixel on each side.
 *
 * @example
 * screenArea({ x: 10, y: 10, width: 5, height: 5 }, view, 2); // at zoom 1 and no offset: { x: 19, y: 19, width: 12, height: 12 }
 */
export const screenArea = (
  area: Rect,
  view: Pick<Viewport, "zoom" | "offsetX" | "offsetY">,
  pixelRatio: number,
): Rect => {
  const scale = view.zoom * pixelRatio;
  const left = Math.floor(area.x * scale + view.offsetX * pixelRatio) - 1;
  const top = Math.floor(area.y * scale + view.offsetY * pixelRatio) - 1;
  const right =
    Math.ceil((area.x + area.width) * scale + view.offsetX * pixelRatio) + 1;
  const bottom =
    Math.ceil((area.y + area.height) * scale + view.offsetY * pixelRatio) + 1;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * An area of the canvas grown by enough canvas pixels to cover two screen pixels at a scale (screen pixels per canvas
 * pixel), within the canvas, so drawing just that area smooths its edges as drawing everything would.
 *
 * @example
 * sourceArea({ x: 10, y: 10, width: 5, height: 5 }, 0.5, 2000, 2000); // grown by 5: { x: 5, y: 5, width: 15, height: 15 }
 */
export const sourceArea = (
  area: Rect,
  scale: number,
  canvasWidth: number,
  canvasHeight: number,
): Rect => {
  const margin = Math.ceil(2 / Math.min(1, scale)) + 1;
  const x = Math.max(0, area.x - margin);
  const y = Math.max(0, area.y - margin);
  return {
    x,
    y,
    width: Math.min(canvasWidth, area.x + area.width + margin) - x,
    height: Math.min(canvasHeight, area.y + area.height + margin) - y,
  };
};

/**
 * Draw the visible part of the canvas onto the screen canvas: grey surround, white canvas, then all layers, positioned by the viewport.
 *
 * Pixels stay sharp when zoomed in past 100% and are smoothed when zoomed out.
 *
 * With an area, only the screen pixels showing that area of the canvas are redrawn (see `screenArea`), blending only
 * that part of each layer, which is much quicker than redrawing everything while a stroke is drawn.
 *
 * @param pixelRatio - device pixels per CSS pixel (`window.devicePixelRatio`), for sharp drawing on high-resolution screens
 * @param override - draw this image instead of one layer's canvas (the stroke preview)
 * @param area - redraw only this area of the canvas (canvas pixels)
 */
export const drawScene = (
  ctx: DrawingContext,
  layers: readonly DrawableLayer[],
  view: Viewport,
  pixelRatio: number,
  override?: LayerOverride,
  area?: Rect,
): void => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PASTEBOARD_COLOUR;
  const scale = view.zoom * pixelRatio;
  let source: Rect | undefined;
  if (area) {
    const clip = screenArea(area, view, pixelRatio);
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
    ctx.clip();
    ctx.fillRect(clip.x, clip.y, clip.width, clip.height);
    source = sourceArea(area, scale, view.canvasWidth, view.canvasHeight);
  } else ctx.fillRect(0, 0, view.width * pixelRatio, view.height * pixelRatio);

  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    view.offsetX * pixelRatio,
    view.offsetY * pixelRatio,
  );
  ctx.imageSmoothingEnabled = view.zoom < 1;
  ctx.fillStyle = CANVAS_BACKGROUND;
  const { x, y, width, height } = source ?? {
    x: 0,
    y: 0,
    width: view.canvasWidth,
    height: view.canvasHeight,
  };
  ctx.fillRect(x, y, width, height);
  drawLayers(ctx, layers, override, source);
  ctx.restore();
};
