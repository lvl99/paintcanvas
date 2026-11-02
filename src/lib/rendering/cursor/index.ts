import type BrushTip from "../BrushTip";

/** The drawing operations the brush cursor needs */
export type CursorContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "translate"
  | "rotate"
  | "beginPath"
  | "ellipse"
  | "moveTo"
  | "lineTo"
  | "stroke"
  | "strokeStyle"
  | "lineWidth"
>;

/** Below this on-screen size (CSS pixels) a crosshair is shown instead of the outline */
export const MIN_OUTLINE_SIZE = 4;

/** Half-length of the small crosshair, in CSS pixels */
const CROSSHAIR = 4;

/**
 * Draw the brush cursor: a 1:1 white outline of the brush shape at the pointer. The overlay canvas uses the "difference" blend mode,
 * so white inverts whatever is underneath and stays visible on any colour. Very small brushes show a crosshair instead.
 *
 * @param x - pointer position on screen (CSS pixels)
 * @param width - brush width on screen (CSS pixels, already multiplied by zoom)
 * @param pixelRatio - device pixels per CSS pixel
 */
export const drawBrushCursor = (
  ctx: CursorContext,
  tip: BrushTip,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  pixelRatio: number,
): void => {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.translate(x * pixelRatio, y * pixelRatio);
  ctx.beginPath();
  if (Math.max(width, height) < MIN_OUTLINE_SIZE) {
    const arm = CROSSHAIR * pixelRatio;
    ctx.moveTo(-arm, 0);
    ctx.lineTo(arm, 0);
    ctx.moveTo(0, -arm);
    ctx.lineTo(0, arm);
  } else {
    if (rotation) ctx.rotate((rotation * Math.PI) / 180);
    const w = width * pixelRatio;
    const h = height * pixelRatio;
    if (tip.outline) {
      for (const [x1, y1, x2, y2] of tip.outline) {
        ctx.moveTo((x1 - 0.5) * w, (y1 - 0.5) * h);
        ctx.lineTo((x2 - 0.5) * w, (y2 - 0.5) * h);
      }
    } else {
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    }
  }
  ctx.stroke();
  ctx.restore();
};
