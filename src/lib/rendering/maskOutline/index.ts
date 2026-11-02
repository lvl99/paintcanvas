import type Viewport from "../../classes/Viewport";
import type { Point } from "../../classes/Viewport";
import type { OutlineLoop } from "../outline";
import type { MaskShape } from "../../selection/Selection";

/** The drawing operations mask outlines need */
export type OutlineContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "rect"
  | "ellipse"
  | "stroke"
  | "fill"
  | "fillRect"
  | "strokeRect"
  | "setLineDash"
  | "strokeStyle"
  | "fillStyle"
  | "lineWidth"
  | "lineDashOffset"
>;

/** Length of each dash, in CSS pixels */
export const DASH_LENGTH = 4;

/** Size of polygon node handles, in CSS pixels */
export const NODE_SIZE = 5;

/** Colours of the alternating dashes: white, then black */
export const DASH_COLOURS = ["#ffffff", "#000000"] as const;

/**
 * Stroke the current path as alternating white and black dashes, 1 px wide in device pixels.
 * One of the two colours always shows, on any background, without blend modes.
 */
const strokeAlternating = (
  ctx: OutlineContext,
  pixelRatio: number,
  dashOffset: number,
): void => {
  ctx.lineWidth = pixelRatio;
  // A solid white line, then black dashes over every other part of it
  ctx.setLineDash([]);
  ctx.strokeStyle = DASH_COLOURS[0];
  ctx.stroke();
  ctx.setLineDash([DASH_LENGTH * pixelRatio, DASH_LENGTH * pixelRatio]);
  ctx.lineDashOffset = dashOffset * pixelRatio;
  ctx.strokeStyle = DASH_COLOURS[1];
  ctx.stroke();
};

/**
 * Draw the mask's outline as "crawling ants": alternating white and black dashes. Animate by increasing `dashOffset` over time.
 *
 * @param loops - outline loops in canvas pixels
 */
export const drawMaskOutline = (
  ctx: OutlineContext,
  loops: readonly OutlineLoop[],
  view: Viewport,
  pixelRatio: number,
  dashOffset: number,
): void => {
  ctx.save();
  ctx.beginPath();
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i += 2) {
      const { x, y } = view.canvasToScreen({
        x: loop[i] as number,
        y: loop[i + 1] as number,
      });
      if (i === 0) ctx.moveTo(x * pixelRatio, y * pixelRatio);
      else ctx.lineTo(x * pixelRatio, y * pixelRatio);
    }
  }
  strokeAlternating(ctx, pixelRatio, dashOffset);
  ctx.restore();
};

/**
 * Draw a lasso shape in progress as alternating white and black dashes, with handles (white with a black border) on polygon nodes.
 */
export const drawLassoPreview = (
  ctx: OutlineContext,
  shape: MaskShape,
  nodes: readonly Point[],
  view: Viewport,
  pixelRatio: number,
): void => {
  const toDevice = (point: Point) => {
    const { x, y } = view.canvasToScreen(point);
    return { x: x * pixelRatio, y: y * pixelRatio };
  };
  ctx.save();
  ctx.beginPath();
  if (shape.type === "polygon") {
    shape.points.forEach((point, i) => {
      const { x, y } = toDevice(point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  } else {
    const { x, y } = toDevice(shape.rect);
    const width = shape.rect.width * view.zoom * pixelRatio;
    const height = shape.rect.height * view.zoom * pixelRatio;
    if (shape.type === "rect") ctx.rect(x, y, width, height);
    else
      ctx.ellipse(
        x + width / 2,
        y + height / 2,
        width / 2,
        height / 2,
        0,
        0,
        Math.PI * 2,
      );
  }
  strokeAlternating(ctx, pixelRatio, 0);
  const size = NODE_SIZE * pixelRatio;
  ctx.setLineDash([]);
  ctx.fillStyle = DASH_COLOURS[0];
  ctx.strokeStyle = DASH_COLOURS[1];
  for (const node of nodes) {
    const { x, y } = toDevice(node);
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }
  ctx.restore();
};
