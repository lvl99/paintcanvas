import {
  encodeRgbaDeflate,
  ImageEncoding,
  type BoundingBox,
} from "../../image";
import type { CanvasFactory } from "../../classes/Layer";
import { drawLayers, type DrawableLayer } from "../../rendering/compositing";
import { createPatchMessage, type PatchMessage } from "..";

/** How long to wait after a change before sending, so quick changes go together */
export const PATCH_DELAY_MS = 200;

/**
 * The smallest box containing every pixel that differs between two images of the same size (one 32-bit value per
 * pixel), or undefined if they are the same.
 *
 * @example
 * changedArea(before, after, 100, 100); // [10, 20, 31, 45]
 */
export const changedArea = (
  before: Uint32Array,
  after: Uint32Array,
  width: number,
  height: number,
): BoundingBox | undefined => {
  let x1 = width;
  let y1 = height;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (before[row + x] === after[row + x]) continue;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      y2 = y;
    }
  }
  return x2 < 0 ? undefined : [x1, y1, x2 + 1, y2 + 1];
};

/**
 * Copy a box of RGBA pixels out of a whole image.
 *
 * @example
 * cropRgba(imageData.data, imageData.width, [10, 10, 20, 20]); // 10 × 10 pixels
 */
export const cropRgba = (
  rgba: Uint8ClampedArray,
  width: number,
  [x1, y1, x2, y2]: BoundingBox,
): Uint8ClampedArray => {
  const rowBytes = (x2 - x1) * 4;
  const cropped = new Uint8ClampedArray(rowBytes * (y2 - y1));
  for (let y = y1; y < y2; y++) {
    const start = (y * width + x1) * 4;
    cropped.set(rgba.subarray(start, start + rowBytes), (y - y1) * rowBytes);
  }
  return cropped;
};

/** Options for sending patches */
export interface PatchSenderOptions {
  width: number;
  height: number;
  /** The user's own layers, top first */
  layers: () => readonly DrawableLayer[];
  /** Delivers a patch (if it throws or rejects, the changes go with the next patch) */
  send: (message: PatchMessage) => void | Promise<void>;
  createCanvas: CanvasFactory;
  delayMs?: number;
  /** Runs the sync once it's due, e.g. waiting for a pause in drawing (runs it straight away by default) */
  whenIdle?: (run: () => unknown) => void;
}

/**
 * Sends the user's drawing as patches. Shortly after any change (and once `whenIdle` runs it), it flattens the
 * user's own layers, compares the result with what it last sent, and sends only the area that changed. This covers every kind of change (strokes,
 * erasing, moving pixels, layer settings and order) without each tool reporting what it changed.
 *
 * @example
 * const sync = new PatchSender({ width, height, layers: () => canvas.layers.layers, send, createCanvas });
 * app.layers.addEventListener("change", () => sync.schedule());
 */
export default class PatchSender {
  private readonly options: PatchSenderOptions;
  private readonly canvas: OffscreenCanvas;
  private readonly context: OffscreenCanvasRenderingContext2D;

  /** The pixels last sent (all transparent to start with) */
  private sent: Uint8ClampedArray;

  private timer?: ReturnType<typeof setTimeout>;

  /** Whether it has stopped (a sync waiting for `whenIdle` doesn't run) */
  private stopped = false;

  /** The sync in progress, so syncs never overlap */
  private running: Promise<void> = Promise.resolve();

  constructor(options: PatchSenderOptions) {
    this.options = options;
    this.canvas = options.createCanvas(options.width, options.height);
    this.context = this.canvas.getContext("2d", {
      willReadFrequently: true,
    }) as OffscreenCanvasRenderingContext2D;
    this.sent = new Uint8ClampedArray(options.width * options.height * 4);
  }

  /**
   * Send the changes soon (changes within the delay go together), once `whenIdle` runs the sync.
   */
  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const run = () =>
        this.stopped ? undefined : this.sync().catch(() => undefined);
      if (this.options.whenIdle) this.options.whenIdle(run);
      else void run();
    }, this.options.delayMs ?? PATCH_DELAY_MS);
  }

  /**
   * Send what changed since the last sync now. Resolves once sent; if sending fails, the changes go with the next sync.
   */
  sync(): Promise<void> {
    clearTimeout(this.timer);
    this.running = this.running
      .catch(() => undefined)
      .then(() => this.sendChanges());
    return this.running;
  }

  /** Flatten the layers and send the changed area, if any */
  private async sendChanges(): Promise<void> {
    const { width, height, send } = this.options;
    this.context.clearRect(0, 0, width, height);
    drawLayers(this.context, this.options.layers());
    const current = this.context.getImageData(0, 0, width, height).data;
    const area = changedArea(
      new Uint32Array(this.sent.buffer),
      new Uint32Array(current.buffer),
      width,
      height,
    );
    if (!area) return;
    const data = await encodeRgbaDeflate(cropRgba(current, width, area), area);
    await send(createPatchMessage(area, ImageEncoding.RgbaDeflate, data));
    this.sent = current;
  }

  /**
   * Count pixels as already sent (e.g. the user's earlier work, restored from a shared drawing's history), so they aren't
   * sent again.
   */
  markSent(area: BoundingBox, rgba: Uint8ClampedArray): void {
    const [x1, y1, x2, y2] = area;
    const rowBytes = (x2 - x1) * 4;
    for (let y = y1; y < y2; y++)
      this.sent.set(
        rgba.subarray((y - y1) * rowBytes, (y - y1 + 1) * rowBytes),
        (y * this.options.width + x1) * 4,
      );
  }

  /**
   * Stop any pending sync.
   */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
