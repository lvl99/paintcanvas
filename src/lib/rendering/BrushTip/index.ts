import type { BrushConfig } from "../../brushes/types";
import type { StampParams } from "../../brushes/params";
import { createOffscreenCanvas, type CanvasFactory } from "../../classes/Layer";
import { traceOutline, type OutlineSegment } from "../outline";

/** The drawing operations a stamp needs */
export type StampContext = Pick<
  OffscreenCanvasRenderingContext2D,
  | "save"
  | "restore"
  | "translate"
  | "rotate"
  | "beginPath"
  | "ellipse"
  | "fill"
  | "drawImage"
  | "fillStyle"
  | "globalAlpha"
>;

/** A decoded image usable as a brush shape */
export type TipImage = CanvasImageSource & { width: number; height: number };

/** Turns a preset's `image` (data URL or bytes) into a decoded image; replaceable for tests */
export type ImageDecoder = (image: string | Uint8Array) => Promise<TipImage>;

/**
 * The bytes and media type in a `data:` URL, read without `fetch()` (which the site's Content Security Policy doesn't
 * allow for `data:` URLs). Throws for anything that isn't a `data:` URL.
 *
 * @example
 * dataUrlBytes("data:image/png;base64,iVBO..."); // { type: "image/png", bytes: Uint8Array [137, 80, 78, 71, ...] }
 * dataUrlBytes("data:text/plain,a%20b"); // { type: "text/plain", bytes: Uint8Array [97, 32, 98] }
 */
export const dataUrlBytes = (
  url: string,
): { type: string; bytes: Uint8Array<ArrayBuffer> } => {
  const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(url);
  if (!match) throw new Error("Brush shapes must be data URLs");
  const [, type = "", base64, data = ""] = match;
  const text = base64 ? atob(data) : decodeURIComponent(data);
  return {
    type,
    bytes: base64
      ? Uint8Array.from(text, (char) => char.charCodeAt(0))
      : new TextEncoder().encode(text),
  };
};

/**
 * Decode a data URL or image file bytes using the browser's image decoder.
 */
export const decodeImage: ImageDecoder = async (image) => {
  if (typeof image === "string") {
    const { type, bytes } = dataUrlBytes(image);
    return createImageBitmap(new Blob([bytes], { type }));
  }
  return createImageBitmap(new Blob([image as Uint8Array<ArrayBuffer>]));
};

/**
 * A brush shape that can be stamped in any colour, size and rotation.
 *
 * Presets without an image use a hard round shape drawn as a vector ellipse, so it stays crisp at every size.
 * Presets with an image use only its alpha values; tinted copies are cached per colour.
 *
 * @example
 * const tip = await BrushTip.load(preset);
 * tip.stamp(ctx, 100, 100, params, "#ff0000");
 */
export default class BrushTip {
  /** Alpha mask of the shape image, or undefined for the round shape */
  readonly mask?: OffscreenCanvas;

  /** Outline of the shape in 0–1 coordinates (for the brush cursor), or undefined for the round shape */
  readonly outline?: OutlineSegment[];

  private readonly createCanvas: CanvasFactory;

  private tintedColour = "";

  private tinted?: OffscreenCanvas;

  constructor(
    mask?: OffscreenCanvas,
    outline?: OutlineSegment[],
    createCanvas: CanvasFactory = createOffscreenCanvas,
  ) {
    this.mask = mask;
    this.outline = outline;
    this.createCanvas = createCanvas;
  }

  /** Whether this is the built-in round shape */
  get isRound(): boolean {
    return this.mask === undefined;
  }

  /**
   * Load a preset's shape: decodes its image and keeps only the alpha. Presets without an image get the round shape.
   */
  static async load(
    preset: BrushConfig,
    decode: ImageDecoder = decodeImage,
    createCanvas: CanvasFactory = createOffscreenCanvas,
  ): Promise<BrushTip> {
    if (!preset.image) return new BrushTip(undefined, undefined, createCanvas);
    const image = await decode(preset.image);
    const mask = createCanvas(image.width, image.height);
    const ctx = mask.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(image, 0, 0);
    // Keep only alpha: paint every visible pixel black, preserving its transparency
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, image.width, image.height);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    const alpha = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0; i < alpha.length; i++)
      alpha[i] = pixels[i * 4 + 3] as number;
    return new BrushTip(
      mask,
      traceOutline(alpha, image.width, image.height),
      createCanvas,
    );
  }

  /**
   * The shape image tinted with a colour (cached until the colour changes).
   */
  private tint(mask: OffscreenCanvas, colour: string): OffscreenCanvas {
    if (this.tinted && this.tintedColour === colour) return this.tinted;
    const canvas = this.tinted ?? this.createCanvas(mask.width, mask.height);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, mask.width, mask.height);
    ctx.globalCompositeOperation = "source-over";
    this.tinted = canvas;
    this.tintedColour = colour;
    return canvas;
  }

  /**
   * Stamp the shape centred on a point, with the stamp's size, rotation, offset and alpha.
   */
  stamp(
    ctx: StampContext,
    x: number,
    y: number,
    params: StampParams,
    colour: string,
  ): void {
    if (params.width <= 0 || params.height <= 0 || params.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = params.alpha;
    ctx.translate(x + params.offsetX, y + params.offsetY);
    if (params.rotation) ctx.rotate((params.rotation * Math.PI) / 180);
    if (this.mask) {
      ctx.drawImage(
        this.tint(this.mask, colour),
        -params.width / 2,
        -params.height / 2,
        params.width,
        params.height,
      );
    } else {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.ellipse(0, 0, params.width / 2, params.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
