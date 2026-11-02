import type Layer from "../../classes/Layer";
import type { Rect } from "../../classes/Viewport";
import { createOffscreenCanvas, type CanvasFactory } from "../../classes/Layer";
import type { LayerOverride } from "../../rendering/compositing";
import { clipRect, unionRect } from "../../brushes/StrokeEngine";
import { boxBounds, boxFromRect, type TransformBox } from "../geometry";

/** The drawing operations needed to draw transformed pixels */
type TransformContext = Pick<
  OffscreenCanvasRenderingContext2D,
  | "save"
  | "restore"
  | "translate"
  | "rotate"
  | "scale"
  | "drawImage"
  | "imageSmoothingEnabled"
  | "imageSmoothingQuality"
>;

/**
 * Draw an image into a transform box (position, size, rotation and flips), smoothing the pixels.
 */
export const drawTransformed = (
  ctx: TransformContext,
  image: CanvasImageSource,
  box: TransformBox,
): void => {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(box.cx, box.cy);
  if (box.rotation) ctx.rotate((box.rotation * Math.PI) / 180);
  ctx.scale(box.width < 0 ? -1 : 1, box.height < 0 ? -1 : 1);
  const width = Math.abs(box.width);
  const height = Math.abs(box.height);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
};

/**
 * Bounding box of the visible pixels (alpha above 0), optionally only where a mask is also above 0.
 *
 * @param rgba - image data, 4 bytes per pixel
 * @param maskRgba - mask image data (alpha = mask value), same size
 *
 * @example
 * contentBounds(imageData.data, 100, 100); // { x: 10, y: 20, width: 30, height: 5 }
 */
export const contentBounds = (
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  maskRgba?: ArrayLike<number>,
): Rect | undefined => {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = (y * width + x) * 4 + 3;
      if (!rgba[alpha] || (maskRgba && !maskRgba[alpha])) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0
    ? undefined
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
};

/**
 * Copy an area of an image into a new canvas the size of the area.
 *
 * @example
 * copyArea(createOffscreenCanvas, layer.canvas, { x: 10, y: 10, width: 50, height: 20 }); // a 50×20 canvas
 */
export const copyArea = (
  createCanvas: CanvasFactory,
  image: CanvasImageSource,
  area: Rect,
): OffscreenCanvas => {
  const { x, y, width, height } = area;
  const canvas = createCanvas(width, height);
  (canvas.getContext("2d") as OffscreenCanvasRenderingContext2D).drawImage(
    image,
    x,
    y,
    width,
    height,
    0,
    0,
    width,
    height,
  );
  return canvas;
};

/**
 * Cut a copied area down to a mask: only the parts where the mask piece (the same area of the mask) is above 0 are kept,
 * partly where it is partly.
 */
export const applyMask = (
  image: OffscreenCanvas,
  maskPiece: OffscreenCanvas,
): void => {
  const ctx = image.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskPiece, 0, 0);
  ctx.globalCompositeOperation = "source-over";
};

/** Pixels lifted off the layer (or pasted) while they are being transformed */
interface Lifted {
  /** The lifted pixels (only the masked part, if there is a mask) */
  floating: OffscreenCanvas;
  /** The layer's original pixels in the source area, to put back on cancel (none for pasted pixels) */
  backup?: OffscreenCanvas;
  /** The mask within the source area, to move it with the pixels */
  maskPiece?: OffscreenCanvas;
}

/**
 * Moves, scales and rotates a layer's pixels (or only the masked part).
 *
 * `prepare` finds the area to transform and shows its box. The first change lifts the pixels off the layer, and `preview` then shows the
 * layer with them transformed. `commit` writes them back transformed; `cancel` puts the original pixels back.
 *
 * `float` shows pasted pixels over a layer instead, ready to transform; `commit` writes them into the layer and `cancel` discards them.
 *
 * Dispatches a `change` event whenever the box or preview changes.
 *
 * @example
 * transformer.prepare(layer, selection.mask);
 * transformer.setBox(moveBox(transformer.box, 20, 0, false));
 * transformer.commit(); // or transformer.cancel()
 */
export default class Transformer extends EventTarget {
  /** Canvas width in pixels */
  readonly width: number;

  /** Canvas height in pixels */
  readonly height: number;

  /** Layer being transformed */
  layer?: Layer;

  /** Area of the original pixels */
  source?: Rect;

  /** Where the pixels are placed now */
  box?: TransformBox;

  private mask?: OffscreenCanvas;

  private lifted?: Lifted;

  private workingCanvas?: OffscreenCanvas;

  private readonly createCanvas: CanvasFactory;

  constructor(
    width: number,
    height: number,
    createCanvas: CanvasFactory = createOffscreenCanvas,
  ) {
    super();
    this.width = width;
    this.height = height;
    this.createCanvas = createCanvas;
  }

  /** Whether there is something to transform (its box is shown) */
  get active(): boolean {
    return this.box !== undefined;
  }

  /** Whether pixels have been lifted and changed (or pasted) but not yet committed */
  get pending(): boolean {
    return this.lifted !== undefined;
  }

  /** Whether the pending pixels were pasted (rather than lifted off the layer) */
  get pasting(): boolean {
    return this.lifted !== undefined && this.lifted.backup === undefined;
  }

  /** Width ÷ height of the original area, kept when scaling proportionally */
  get aspect(): number {
    return this.source ? this.source.width / this.source.height : 1;
  }

  /** The layer with the lifted pixels transformed, to draw in its place; undefined until something changes */
  get preview(): LayerOverride | undefined {
    return this.layer && this.lifted && this.workingCanvas
      ? { layer: this.layer, image: this.workingCanvas }
      : undefined;
  }

  /**
   * Find what to transform on a layer: all its visible pixels, or only those inside the mask. Shows nothing if there are none.
   */
  prepare(layer: Layer, mask?: OffscreenCanvas): void {
    this.reset();
    const rgba = layer.context.getImageData(
      0,
      0,
      layer.width,
      layer.height,
    ).data;
    const maskRgba = mask
      ?.getContext("2d")
      ?.getImageData(0, 0, layer.width, layer.height).data;
    const source = contentBounds(rgba, layer.width, layer.height, maskRgba);
    if (source) {
      this.layer = layer;
      this.mask = mask;
      this.source = source;
      this.box = boxFromRect(source);
    }
    this.notify();
  }

  /**
   * Show pasted pixels over a layer, in an area, ready to transform. They are only written into the layer on `commit`.
   */
  float(layer: Layer, image: OffscreenCanvas, area: Rect): void {
    this.reset();
    this.layer = layer;
    this.source = area;
    this.box = boxFromRect(area);
    this.lifted = { floating: image };
    this.renderPreview();
    this.notify();
  }

  /**
   * Place the pixels in a new box, lifting them off the layer first if needed.
   */
  setBox(box: TransformBox): void {
    if (!this.layer || !this.source) return;
    this.lifted ??= this.lift(this.layer, this.source);
    this.box = box;
    this.renderPreview();
    this.notify();
  }

  /**
   * Write the transformed pixels into the layer. Returns the mask piece and source area so the mask can be moved too, and the
   * changed area with a copy of its pixels from before the transform (for undo), or undefined if nothing changed. Afterwards
   * the transformer is empty; call `prepare` again to keep transforming.
   */
  commit():
    | {
        maskPiece?: OffscreenCanvas;
        source: Rect;
        box: TransformBox;
        area: Rect;
        before: OffscreenCanvas;
      }
    | undefined {
    const { layer, lifted, source, box } = this;
    if (!layer || !lifted || !source || !box) {
      this.reset();
      return undefined;
    }
    // Lifted pixels change where they were and where they go; pasted pixels only where they go (which may be off the canvas)
    const area = clipRect(
      lifted.backup ? unionRect(source, boxBounds(box)) : boxBounds(box),
      this.width,
      this.height,
    );
    if (!area) {
      this.reset();
      this.notify();
      return undefined;
    }
    const before = this.original(layer, lifted, source, area);
    drawTransformed(layer.context, lifted.floating, box);
    this.reset();
    this.notify();
    return { maskPiece: lifted.maskPiece, source, box, area, before };
  }

  /**
   * Put the original pixels back and return the box to where it started (Escape). Pasted pixels are discarded.
   */
  cancel(): void {
    const { layer, lifted, source } = this;
    if (this.pasting) {
      this.reset();
      this.notify();
      return;
    }
    if (layer && lifted?.backup && source) {
      const ctx = layer.context;
      ctx.clearRect(source.x, source.y, source.width, source.height);
      ctx.drawImage(lifted.backup, source.x, source.y);
      this.lifted = undefined;
      this.box = boxFromRect(source);
      this.notify();
    }
  }

  /**
   * Forget the current transform without changing the layer.
   */
  reset(): void {
    this.layer = undefined;
    this.mask = undefined;
    this.source = undefined;
    this.box = undefined;
    this.lifted = undefined;
  }

  /**
   * Copy the pixels to transform off the layer, leaving a hole where they were.
   */
  private lift(layer: Layer, source: Rect): Lifted {
    const { x, y, width, height } = source;
    const copy = (image: CanvasImageSource) =>
      copyArea(this.createCanvas, image, source);
    const backup = copy(layer.canvas);
    const floating = copy(layer.canvas);
    const ctx = layer.context;
    if (this.mask) {
      const maskPiece = copy(this.mask);
      applyMask(floating, maskPiece);
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(maskPiece, x, y);
      ctx.restore();
      return { floating, backup, maskPiece };
    }
    ctx.clearRect(x, y, width, height);
    return { floating, backup };
  }

  /**
   * A copy of the layer's pixels within an area as they were before any pixels were lifted off it.
   */
  private original(
    layer: Layer,
    lifted: Lifted,
    source: Rect,
    area: Rect,
  ): OffscreenCanvas {
    const canvas = copyArea(this.createCanvas, layer.canvas, area);
    if (lifted.backup) {
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      const x = source.x - area.x;
      const y = source.y - area.y;
      ctx.clearRect(x, y, source.width, source.height);
      ctx.drawImage(lifted.backup, x, y);
    }
    return canvas;
  }

  /**
   * Redraw the preview: the layer (with the hole) plus the lifted pixels in their box.
   */
  private renderPreview(): void {
    const { layer, lifted, box } = this;
    this.workingCanvas ??= this.createCanvas(this.width, this.height);
    const ctx = this.workingCanvas.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage((layer as Layer).canvas, 0, 0);
    drawTransformed(ctx, (lifted as Lifted).floating, box as TransformBox);
  }

  /**
   * Dispatch a `change` event.
   */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
