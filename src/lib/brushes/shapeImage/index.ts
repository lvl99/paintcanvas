import { bytesToBase64 } from "../../image";
import { createOffscreenCanvas, type CanvasFactory } from "../../classes/Layer";

/** Largest brush shape file, in bytes */
export const MAX_SHAPE_FILE_BYTES = 2 * 1024 * 1024;

/** Largest brush shape width or height, in pixels; larger images are shrunk */
export const MAX_SHAPE_SIZE = 512;

/** Messages shown when a brush shape can't be used */
export const SHAPE_ERRORS = {
  type: "Brush shapes must be PNG images",
  size: "Brush shape images can be up to 2 MB",
  decode: "Couldn't read the brush shape image",
  noImage: "There is no PNG image to paste",
} as const;

/** A brush shape image can't be used, with a message for the user */
export class ShapeImageError extends Error {}

/** A brush shape ready to use in a preset */
export interface ShapeImage {
  /** PNG data URL */
  image: string;
  width: number;
  height: number;
}

/** What reading a shape needs (replaceable for tests) */
export interface ShapeImageDependencies {
  decode?: (blob: Blob) => Promise<ImageBitmap>;
  createCanvas?: CanvasFactory;
}

/**
 * Turn a PNG file into a brush shape: at most 2 MB, shrunk to at most 512 pixels on its longest side, as a PNG data
 * URL. Its alpha is used as is. Throws a `ShapeImageError` if it can't be used.
 *
 * @example
 * const shape = await readShapeImage(input.files[0]); // { image: "data:image/png;base64,…", width: 120, height: 80 }
 */
export const readShapeImage = async (
  blob: Blob,
  {
    decode = (file) => createImageBitmap(file),
    createCanvas = createOffscreenCanvas,
  }: ShapeImageDependencies = {},
): Promise<ShapeImage> => {
  if (blob.type !== "image/png") throw new ShapeImageError(SHAPE_ERRORS.type);
  if (blob.size > MAX_SHAPE_FILE_BYTES)
    throw new ShapeImageError(SHAPE_ERRORS.size);
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(blob);
  } catch {
    throw new ShapeImageError(SHAPE_ERRORS.decode);
  }
  const scale = Math.min(
    1,
    MAX_SHAPE_SIZE / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = createCanvas(width, height);
  (canvas.getContext("2d") as OffscreenCanvasRenderingContext2D).drawImage(
    bitmap,
    0,
    0,
    width,
    height,
  );
  const png = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await png.arrayBuffer());
  return {
    image: `data:image/png;base64,${bytesToBase64(bytes)}`,
    width,
    height,
  };
};

/**
 * Read a brush shape from a PNG image on the clipboard. Throws a `ShapeImageError` if there is none or it can't be
 * used.
 */
export const readClipboardShape = async (
  clipboard: Pick<Clipboard, "read"> = navigator.clipboard,
  deps: ShapeImageDependencies = {},
): Promise<ShapeImage> => {
  let items: ClipboardItems;
  try {
    items = await clipboard.read();
  } catch {
    throw new ShapeImageError(SHAPE_ERRORS.noImage);
  }
  const item = items.find((entry) => entry.types.includes("image/png"));
  if (!item) throw new ShapeImageError(SHAPE_ERRORS.noImage);
  return readShapeImage(await item.getType("image/png"), deps);
};
