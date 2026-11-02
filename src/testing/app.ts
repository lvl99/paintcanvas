import PaintCanvas from "../lib/classes/PaintCanvas";
import { createRecordingCanvasFactory } from "./recordingCanvas";

/** The handle of the author of presets made in apps from `createApp` */
export const TEST_HANDLE = "ada.example";

/**
 * Create a canvas whose canvases record drawing calls (jsdom cannot draw), with "Ada" as the author of new presets.
 */
export const createApp = (): PaintCanvas =>
  new PaintCanvas({
    createCanvas: createRecordingCanvasFactory().factory,
    presetAuthor: () => ({ name: "Ada", handle: TEST_HANDLE }),
  });
