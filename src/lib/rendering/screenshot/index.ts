import { createOffscreenCanvas, type CanvasFactory } from "../../classes/Layer";
import {
  drawFlattened,
  type DrawableLayer,
  type LayerOverride,
} from "../compositing";

/** The parts of the File System Access API used to choose where to save (Chromium browsers only) */
export interface SaveFilePicker {
  (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{
    createWritable(): Promise<{
      write(data: Blob): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
}

/** A kind of file the save dialog offers */
export interface SaveFileType {
  description: string;
  accept: Record<string, string[]>;
}

/** PNG images (screenshots) */
export const PNG_FILE_TYPE: SaveFileType = {
  description: "PNG image",
  accept: { "image/png": [".png"] },
};

/** JSON files (brush presets) */
export const JSON_FILE_TYPE: SaveFileType = {
  description: "JSON file",
  accept: { "application/json": [".json"] },
};

/** How a file is saved: with a save dialog (folder picker) or as a browser download */
export type SaveMethod = "picker" | "download";

/**
 * File name for a screenshot taken at a time, starting with a prefix (see `PaintCanvasNames.filePrefix`).
 *
 * @example
 * screenshotName(new Date(2026, 9, 19, 14, 30, 5)); // "paintcanvas-2026-10-19-143005.png"
 */
export const screenshotName = (
  date: Date = new Date(),
  prefix = "paintcanvas",
): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
};

/**
 * Flatten all visible layers onto white at full canvas size and encode the result as a PNG.
 *
 * @param override - draw this image instead of one layer's canvas (e.g. a transform in progress)
 */
export const renderScreenshot = async (
  layers: readonly DrawableLayer[],
  width: number,
  height: number,
  override?: LayerOverride,
  createCanvas: CanvasFactory = createOffscreenCanvas,
): Promise<Blob> => {
  const canvas = createCanvas(width, height);
  drawFlattened(
    canvas.getContext("2d") as OffscreenCanvasRenderingContext2D,
    layers,
    width,
    height,
    width,
    height,
    override,
  );
  return canvas.convertToBlob({ type: "image/png" });
};

/** A compressed snapshot: a JPEG and its size in pixels */
export interface JpegImage {
  blob: Blob;
  width: number;
  height: number;
}

/** JPEG qualities tried for a snapshot, best first, before making it smaller */
export const SNAPSHOT_QUALITIES = [0.92, 0.8, 0.7] as const;

/** How much smaller a snapshot gets each time it is still too large at the lowest quality */
export const SNAPSHOT_SHRINK = 0.75;

/**
 * Flatten all visible layers onto white and encode the result as a JPEG no larger than `maxBytes` (e.g. an upload
 * limit): full size at the best quality that fits, otherwise smaller.
 *
 * @param override - draw this image instead of one layer's canvas (e.g. a transform in progress)
 * @param maxBytes - the largest file allowed (no limit by default)
 */
export const renderJpegImage = async (
  layers: readonly DrawableLayer[],
  width: number,
  height: number,
  override?: LayerOverride,
  createCanvas: CanvasFactory = createOffscreenCanvas,
  maxBytes: number = Infinity,
): Promise<JpegImage> => {
  for (let scale = 1; ; scale *= SNAPSHOT_SHRINK) {
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = createCanvas(targetWidth, targetHeight);
    drawFlattened(
      canvas.getContext("2d") as OffscreenCanvasRenderingContext2D,
      layers,
      width,
      height,
      targetWidth,
      targetHeight,
      override,
    );
    for (const quality of SNAPSHOT_QUALITIES) {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (blob.size <= maxBytes || (targetWidth === 1 && targetHeight === 1))
        return { blob, width: targetWidth, height: targetHeight };
    }
  }
};

/**
 * Save a file. Where the browser supports it, a save dialog lets the user choose the folder; otherwise it downloads.
 * Returns how it was saved, or undefined if the user cancelled the dialog.
 *
 * @param picker - `window.showSaveFilePicker` (replaceable for tests)
 * @param fileType - the kind of file the save dialog offers (PNG by default)
 */
export const saveFile = async (
  blob: Blob,
  name: string,
  picker: SaveFilePicker | undefined = (
    window as unknown as { showSaveFilePicker?: SaveFilePicker }
  ).showSaveFilePicker?.bind(window),
  fileType: SaveFileType = PNG_FILE_TYPE,
): Promise<SaveMethod | undefined> => {
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [fileType],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "picker";
    } catch (error) {
      if ((error as Error).name === "AbortError") return undefined;
      throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Give the browser time to start the download before releasing the file
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "download";
};
