import type Viewport from "../../classes/Viewport";
import {
  boxCorners,
  handlePosition,
  ROTATE_HANDLE_DISTANCE,
  rotateHandle,
  type Handle,
  type TransformBox,
} from "../../transform/geometry";
import { DASH_COLOURS, NODE_SIZE, type OutlineContext } from "../maskOutline";

/** Size of transform handles, in CSS pixels */
export const HANDLE_SIZE = NODE_SIZE + 2;

/**
 * Draw a transform box: a white outline with a black inner line (visible on any colour), square handles (white with a
 * black border), and the round rotate handle on a line out from the top-centre handle.
 */
export const drawTransformBox = (
  ctx: OutlineContext,
  box: TransformBox,
  handles: readonly Handle[],
  view: Viewport,
  pixelRatio: number,
): void => {
  const toDevice = (point: { x: number; y: number }) => {
    const { x, y } = view.canvasToScreen(point);
    return { x: x * pixelRatio, y: y * pixelRatio };
  };
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  boxCorners(box).forEach((corner, i) => {
    const { x, y } = toDevice(corner);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const first = toDevice(boxCorners(box)[0] as { x: number; y: number });
  ctx.lineTo(first.x, first.y);
  ctx.lineWidth = pixelRatio * 3;
  ctx.strokeStyle = DASH_COLOURS[0];
  ctx.stroke();
  ctx.lineWidth = pixelRatio;
  ctx.strokeStyle = DASH_COLOURS[1];
  ctx.stroke();

  // The rotate handle's line, under the handles
  const rotation = rotateHandle(
    box,
    toDevice,
    ROTATE_HANDLE_DISTANCE * pixelRatio,
  );
  ctx.beginPath();
  ctx.moveTo(rotation.anchor.x, rotation.anchor.y);
  ctx.lineTo(rotation.handle.x, rotation.handle.y);
  ctx.lineWidth = pixelRatio * 3;
  ctx.strokeStyle = DASH_COLOURS[0];
  ctx.stroke();
  ctx.lineWidth = pixelRatio;
  ctx.strokeStyle = DASH_COLOURS[1];
  ctx.stroke();

  const size = HANDLE_SIZE * pixelRatio;
  ctx.fillStyle = DASH_COLOURS[0];
  ctx.beginPath();
  ctx.ellipse(
    rotation.handle.x,
    rotation.handle.y,
    size / 2,
    size / 2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.stroke();
  for (const handle of handles) {
    const { x, y } = toDevice(handlePosition(box, handle));
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }
  ctx.restore();
};
