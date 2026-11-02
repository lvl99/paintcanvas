import type { CanvasFactory } from "../lib/classes/Layer";
import { createRecordingContext, type Recorded } from "./recordingContext";

/** A fake canvas whose 2D context records calls */
export interface RecordingCanvas {
  canvas: OffscreenCanvas;
  calls: Recorded[];
}

/**
 * Create a canvas factory whose canvases each keep one recording context (reading image data returns transparent pixels). Created canvases are listed in order.
 */
export const createRecordingCanvasFactory = () => {
  const created: RecordingCanvas[] = [];
  const factory: CanvasFactory = (width, height) => {
    const { ctx, calls } = createRecordingContext();
    // Transparent pixels for code that reads image data
    (ctx as unknown as Record<string, unknown>).getImageData = (
      _x: number,
      _y: number,
      w: number,
      h: number,
    ) => ({
      data: new Uint8ClampedArray(w * h * 4),
    });
    // Setting the helper above was recorded as a call; start with a clean record
    calls.length = 0;
    const canvas = {
      width,
      height,
      getContext: () => ctx,
    } as unknown as OffscreenCanvas;
    created.push({ canvas, calls });
    return canvas;
  };
  return { factory, created };
};
