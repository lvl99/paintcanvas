import PaintCanvas, {
  type PaintCanvasOptions,
} from "../lib/classes/PaintCanvas";
import { createRecordingCanvasFactory } from "./recordingCanvas";

/** The handle of the author of presets made in apps from `createApp` */
export const TEST_HANDLE = "ada.example";

/**
 * Create a canvas whose canvases record drawing calls (jsdom cannot draw), with "Ada" as the author of new presets.
 * Other options are passed on.
 *
 * @example
 * const app = createApp({ stores: { brushes: myStore } });
 */
export const createApp = (options: PaintCanvasOptions = {}): PaintCanvas =>
  new PaintCanvas({
    createCanvas: createRecordingCanvasFactory().factory,
    presetAuthor: () => ({ name: "Ada", handle: TEST_HANDLE }),
    ...options,
  });
