import {
  ImageEncoding,
  boundingBoxSize,
  base64ToBytes,
  decodeRgbaDeflate,
} from "../../image";
import { BlendMode, createOffscreenCanvas, type CanvasFactory } from "../Layer";
import type { DrawableLayer } from "../../rendering/compositing";
import type { PatchMessage } from "../../messages";

/** A drawing from elsewhere (e.g. another person's), flattened into one sheet */
export interface ExternalSheet extends DrawableLayer {
  /** Where the drawing comes from: an ID the implementer chooses (e.g. a user ID), which PaintCanvas doesn't interpret */
  source: string;
  canvas: OffscreenCanvas;
}

/** Decodes a PNG into pixels (replaceable for tests) */
export type DecodePng = (
  bytes: Uint8Array<ArrayBuffer>,
) => Promise<ImageBitmap>;

/**
 * Drawings from elsewhere (e.g. other people's), one flattened sheet per source. They are drawn under the user's own
 * layers, so their own work is always in focus; the sheets are ordered by when each source's first drawing arrived
 * (newest on top).
 *
 * Dispatches a `change` event when a sheet changes.
 *
 * @example
 * const external = new ExternalSheets(2000, 2000);
 * await external.apply("user-2", patchMessage);
 * drawLayers(ctx, [...ownLayers, ...external.sheets]);
 */
export default class ExternalSheets extends EventTarget {
  private width: number;
  private height: number;
  private readonly createCanvas: CanvasFactory;
  private readonly decodePng: DecodePng;

  /** Sheets from top to bottom, as layer lists are ordered */
  private list: ExternalSheet[] = [];

  /** Updates are applied one at a time, in the order they arrive */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    width: number,
    height: number,
    createCanvas: CanvasFactory = createOffscreenCanvas,
    decodePng: DecodePng = (bytes) =>
      createImageBitmap(new Blob([bytes], { type: "image/png" })),
  ) {
    super();
    this.width = width;
    this.height = height;
    this.createCanvas = createCanvas;
    this.decodePng = decodePng;
  }

  /** Sheets from top to bottom */
  get sheets(): readonly ExternalSheet[] {
    return this.list;
  }

  /**
   * A source's sheet, created (on top of the others) if it doesn't exist yet.
   */
  private sheetOf(source: string): ExternalSheet {
    let sheet = this.list.find((existing) => existing.source === source);
    if (!sheet) {
      sheet = {
        source,
        canvas: this.createCanvas(this.width, this.height),
        visible: true,
        opacity: 1,
        blendMode: BlendMode.Normal,
      };
      this.list = [sheet, ...this.list];
    }
    return sheet;
  }

  /**
   * Draw a patch's pixels onto a source's sheet, replacing what was there. Updates are applied in order. Returns once
   * this update is applied; a patch whose data can't be decoded is skipped.
   */
  apply(source: string, message: PatchMessage): Promise<void> {
    this.queue = this.queue
      .then(() => this.draw(source, message))
      .catch(() => undefined);
    return this.queue;
  }

  /**
   * Draw onto a source's sheet with a drawing function (e.g. a received stroke), after any updates before it. Returns
   * once drawn; a drawing that throws is skipped.
   */
  paint(
    source: string,
    draw: (canvas: OffscreenCanvas) => void | Promise<void>,
  ): Promise<void> {
    this.queue = this.queue
      .then(async () => {
        await draw(this.sheetOf(source).canvas);
        this.dispatchEvent(new Event("change"));
      })
      .catch(() => undefined);
    return this.queue;
  }

  /** Decode and draw one patch */
  private async draw(source: string, message: PatchMessage): Promise<void> {
    const [x, y] = message.coords;
    const { width, height } = boundingBoxSize(message.coords);
    const context = this.sheetOf(source).canvas.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    if (message.encoding === ImageEncoding.Png) {
      const image = await this.decodePng(base64ToBytes(message.data));
      context.clearRect(x, y, width, height);
      context.drawImage(image, x, y);
    } else {
      const rgba = await decodeRgbaDeflate(message.data, message.coords);
      context.putImageData(new ImageData(rgba, width, height), x, y);
    }
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Put a saved drawing back onto a source's sheet (e.g. other people's drawing in a saved drawing).
   */
  restore(source: string, image: CanvasImageSource): void {
    const context = this.sheetOf(source).canvas.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(image, 0, 0);
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Change the canvas size, removing all sheets.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.clear();
  }

  /**
   * Remove all sheets (e.g. when a shared drawing ends).
   */
  clear(): void {
    this.list = [];
    this.dispatchEvent(new Event("change"));
  }
}
