import type { DrawingContext } from "../compositing";

/** Light square colour of the transparency checkerboard */
export const CHECKER_LIGHT = "#ffffff";

/** Dark square colour of the transparency checkerboard */
export const CHECKER_DARK = "#cccccc";

/**
 * Fill an area with a grey and white checkerboard, the usual way of showing transparency.
 *
 * @example
 * drawCheckerboard(ctx, 30, 30, 5);
 */
export const drawCheckerboard = (
  ctx: Pick<DrawingContext, "fillStyle" | "fillRect">,
  width: number,
  height: number,
  squareSize: number,
): void => {
  ctx.fillStyle = CHECKER_LIGHT;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = CHECKER_DARK;
  for (let y = 0; y * squareSize < height; y++) {
    for (let x = y % 2; x * squareSize < width; x += 2) {
      ctx.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
    }
  }
};

/**
 * Size of an image scaled to fit inside a box, keeping its proportions.
 *
 * @example
 * fitSize(2000, 1000, 90, 90); // { width: 90, height: 45 }
 */
export const fitSize = (
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
) => {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return { width: width * scale, height: height * scale };
};
