import { randomSeed, seededRandom, type RandomFn } from "../../utils/random";
import type { TimedStrokePoint } from "../../messages/schema";
import type { BrushConfig, BrushStrokePoint } from "../types";
import type Layer from "../../classes/Layer";
import type { Rect } from "../../classes/Viewport";
import { createOffscreenCanvas, type CanvasFactory } from "../../classes/Layer";
import type BrushTip from "../../rendering/BrushTip";
import type { LayerOverride } from "../../rendering/compositing";
import StrokeSampler from "../StrokeSampler";
import StrokePath from "../StrokePath";
import { pointInput, snapStamp, stampParams } from "../params";

/** Whether a stroke adds paint or erases */
export type StrokeMode = "paint" | "erase";

/** Everything needed to draw one stroke */
export interface StrokeOptions {
  /** Layer the stroke is drawn on */
  layer: Layer;
  mode: StrokeMode;
  preset: BrushConfig;
  /** Size chosen by the user */
  size: { width: number; height: number };
  /** Paint colour as a hex string (for the eraser, the colour it paints when the layer's alpha lock is on) */
  colour: string;
  tip: BrushTip;
  /** Whether input comes from a pen (enables pressure and tilt) */
  isPen: boolean;
  /** Mask limiting where the stroke applies (its alpha scales the stroke), if a selection is active */
  mask?: OffscreenCanvas;
  /** Seed for the stroke's random variation, to draw a recorded stroke the same way again (a new one by default) */
  seed?: number;
  /** Random source for parameter variation, instead of one from `seed` (replaceable for tests) */
  random?: RandomFn;
}

/** What a finished stroke was drawn from, so it can be sent and drawn again */
export interface RecordedStroke {
  mode: StrokeMode;
  preset: BrushConfig;
  size: { width: number; height: number };
  colour: string;
  isPen: boolean;
  /** Seed of the stroke's random variation */
  seed: number;
  /** Input points as they arrived, before sampling and smoothing */
  points: TimedStrokePoint[];
}

/** Extra pixels added around each stamp's bounds so anti-aliased edges are included */
const STAMP_MARGIN = 2;

/**
 * Grow a rectangle to include another (the first may be empty).
 *
 * @example
 * unionRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 5, height: 5 });
 * // { x: 0, y: 0, width: 25, height: 10 }
 */
export const unionRect = (a: Rect | undefined, b: Rect): Rect => {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/**
 * Snap a rectangle outwards to whole pixels and clip it to the canvas. Returns undefined if nothing is left.
 */
export const clipRect = (
  rect: Rect,
  width: number,
  height: number,
): Rect | undefined => {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : undefined;
};

/**
 * How the stroke buffer is merged into the layer: with alpha lock on, both brush and eraser paint only onto existing
 * pixels; otherwise the brush paints over the layer and the eraser removes from it.
 */
const compositeOperation = (
  mode: StrokeMode,
  alphaLock: boolean,
): GlobalCompositeOperation => {
  if (alphaLock) return "source-atop";
  return mode === "erase" ? "destination-out" : "source-over";
};

/** Event dispatched just before a finished stroke is written into its layer */
export const BEFORE_COMMIT_EVENT = "beforecommit";

/** Event dispatched when a stroke starts */
export const STROKE_BEGIN_EVENT = "strokebegin";

/** Event dispatched when a stroke ends: written into its layer, or cancelled */
export const STROKE_END_EVENT = "strokeend";

/** Details of a `beforecommit` event: the layer, the area of it the stroke will change, and the stroke itself */
export interface StrokeCommitDetail {
  layer: Layer;
  area: Rect;
  stroke: RecordedStroke;
}

/** A stroke in progress */
interface ActiveStroke {
  options: StrokeOptions;
  sampler: StrokeSampler;
  path: StrokePath;
  /** Area changed by the stroke so far */
  dirty?: Rect;
  /** Seed of the stroke's random variation */
  seed: number;
  random: RandomFn;
  /** Input points so far */
  points: TimedStrokePoint[];
}

/**
 * Draws brush and eraser strokes.
 *
 * Stamps are drawn at full strength into a stroke buffer, so overlapping stamps within one stroke do not build up opacity.
 * The buffer is merged into the layer with the stroke's opacity (the preset's `alpha`):
 * - Brush: painted over the layer (or only onto existing pixels when the layer's alpha lock is on).
 * - Eraser: removes the buffer's shape from the layer (or paints its colour onto existing pixels when alpha lock is on).
 * - With a mask, the buffer is first cut to the mask, so the stroke only applies inside it.
 *
 * While drawing, `preview` provides the layer with the stroke merged in, to draw instead of the layer. The stroke is written into the layer when it ends.
 *
 * Dispatches a `change` event whenever the preview changes, and when a stroke is committed or cancelled. Dispatches a
 * `beforecommit` event (with `StrokeCommitDetail`) just before a stroke that changes its layer is written into it, so
 * the area can be recorded for undo. Dispatches `strokebegin` when a stroke starts and `strokeend` when it's committed or
 * cancelled.
 *
 * @example
 * engine.begin(options, { x: 10, y: 10, pressure: 0.5 }, event.timeStamp);
 * engine.move({ x: 20, y: 12 }, event.timeStamp);
 * engine.end({ x: 25, y: 15 }, event.timeStamp);
 */
export default class StrokeEngine extends EventTarget {
  /** Canvas width in pixels */
  readonly width: number;

  /** Canvas height in pixels */
  readonly height: number;

  private readonly createCanvas: CanvasFactory;

  private bufferCanvas?: OffscreenCanvas;

  private workingCanvas?: OffscreenCanvas;

  private maskedCanvas?: OffscreenCanvas;

  private active?: ActiveStroke;

  /** Area of the preview changed since `takeChangedArea` was last called */
  private changedArea?: Rect;

  /** Whether strokes record their points and stamps for the debug overlay */
  debugEnabled = false;

  /** Points recorded and stamps placed by the current or last stroke (only while `debugEnabled`) */
  readonly debugTrace: {
    points: BrushStrokePoint[];
    stamps: BrushStrokePoint[];
  } = { points: [], stamps: [] };

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

  /**
   * The area of the canvas whose preview changed since this was last called (stamps placed, or a stroke cancelled or
   * written into its layer), to redraw only that area; undefined if nothing changed.
   */
  takeChangedArea(): Rect | undefined {
    const area = this.changedArea;
    this.changedArea = undefined;
    return area;
  }

  /** Whether a stroke is in progress */
  get drawing(): boolean {
    return this.active !== undefined;
  }

  /** The layer with the stroke in progress merged in, to draw in its place; undefined when not drawing */
  get preview(): LayerOverride | undefined {
    return this.active && this.workingCanvas
      ? { layer: this.active.options.layer, image: this.workingCanvas }
      : undefined;
  }

  /** The stroke buffer (created on first use) */
  private get buffer(): OffscreenCanvas {
    this.bufferCanvas ??= this.createCanvas(this.width, this.height);
    return this.bufferCanvas;
  }

  /** The preview canvas (created on first use) */
  private get working(): OffscreenCanvas {
    this.workingCanvas ??= this.createCanvas(this.width, this.height);
    return this.workingCanvas;
  }

  /**
   * Turn recording of stroke points and stamps (for the debug overlay) on or off.
   */
  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.debugTrace.points = [];
    this.debugTrace.stamps = [];
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Record a sampled point for the debug overlay.
   */
  private trace(
    point: BrushStrokePoint | undefined,
  ): BrushStrokePoint | undefined {
    if (point && this.debugEnabled) this.debugTrace.points.push(point);
    return point;
  }

  /**
   * Start a stroke at the pointer-down point. Cancels any stroke already in progress.
   */
  begin(options: StrokeOptions, point: BrushStrokePoint, time: number): void {
    this.cancel();
    const seed = options.seed ?? randomSeed();
    this.active = {
      options,
      seed,
      random: options.random ?? seededRandom(seed),
      points: [{ ...point, time }],
      sampler: new StrokeSampler(options.preset.sampleRate),
      path: new StrokePath(
        options.preset.smoothingType,
        options.preset.spacing,
      ),
    };
    this.dispatchEvent(new Event(STROKE_BEGIN_EVENT));
    const ctx = this.working.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(options.layer.canvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    this.debugTrace.points = [];
    this.debugTrace.stamps = [];
    this.place(
      this.active.path.add(
        this.trace(this.active.sampler.start(point, time)) as BrushStrokePoint,
      ),
    );
  }

  /**
   * Continue the stroke as the pointer moves. Points are recorded at the preset's sample rate.
   */
  move(point: BrushStrokePoint, time: number): void {
    const active = this.active;
    if (!active) return;
    active.points.push({ ...point, time });
    const recorded = this.trace(active.sampler.move(point, time));
    if (recorded) this.place(active.path.add(recorded));
  }

  /**
   * Finish the stroke at the pointer-up point and write it into the layer.
   */
  end(point: BrushStrokePoint, time: number): void {
    const active = this.active;
    if (!active) return;
    active.points.push({ ...point, time });
    const recorded = this.trace(active.sampler.end(point, time));
    const stamps = recorded ? active.path.add(recorded) : [];
    this.place([...stamps, ...active.path.finish()]);
    this.commit(active);
  }

  /**
   * Abandon the stroke in progress without changing the layer.
   */
  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.clearBuffer(active.dirty);
    if (active.dirty)
      this.changedArea = unionRect(this.changedArea, active.dirty);
    this.active = undefined;
    this.dispatchEvent(new Event(STROKE_END_EVENT));
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Stamp the shape at each point into the buffer, then refresh the preview where it changed.
   */
  private place(points: BrushStrokePoint[]): void {
    const active = this.active as ActiveStroke;
    if (points.length === 0) return;
    if (this.debugEnabled) this.debugTrace.stamps.push(...points);
    const { preset, size, tip, colour, isPen } = active.options;
    const { random } = active;
    const ctx = this.buffer.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    // Stroke opacity is applied when merging, so stamps use only their own alpha variation
    const stampPreset = { ...preset, alpha: 1 };
    let changed: Rect | undefined;
    for (const point of points) {
      const varied = stampParams(
        stampPreset,
        size,
        pointInput(point, isPen),
        random,
      );
      const { x, y, params } = preset.snapToPixelGrid
        ? snapStamp(point.x, point.y, varied)
        : { x: point.x, y: point.y, params: varied };
      tip.stamp(ctx, x, y, params, colour);
      const reach = Math.hypot(params.width, params.height) / 2 + STAMP_MARGIN;
      changed = unionRect(changed, {
        x: x + params.offsetX - reach,
        y: y + params.offsetY - reach,
        width: reach * 2,
        height: reach * 2,
      });
    }
    const area = changed && clipRect(changed, this.width, this.height);
    if (!area) return;
    active.dirty = unionRect(active.dirty, area);
    this.changedArea = unionRect(this.changedArea, area);
    this.mergeInto(this.working, active, area, true);
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Merge the buffer into a target canvas within an area. For the preview, the area is first reset to the layer's pixels.
   */
  private mergeInto(
    target: OffscreenCanvas,
    active: ActiveStroke,
    area: Rect,
    resetFromLayer: boolean,
  ): void {
    const { layer, preset, mode } = active.options;
    const ctx = target.getContext("2d") as OffscreenCanvasRenderingContext2D;
    const { x, y, width, height } = area;
    ctx.save();
    if (resetFromLayer) {
      ctx.clearRect(x, y, width, height);
      ctx.drawImage(layer.canvas, x, y, width, height, x, y, width, height);
    }
    ctx.globalAlpha = Math.max(0, Math.min(1, preset.alpha ?? 1));
    ctx.globalCompositeOperation = compositeOperation(mode, layer.alphaLock);
    ctx.drawImage(
      this.strokeImage(active, area),
      x,
      y,
      width,
      height,
      x,
      y,
      width,
      height,
    );
    ctx.restore();
  }

  /**
   * The stroke buffer, cut to the mask within an area when a mask is active (partially masked areas let partial paint through).
   */
  private strokeImage(active: ActiveStroke, area: Rect): OffscreenCanvas {
    const mask = active.options.mask;
    if (!mask) return this.buffer;
    this.maskedCanvas ??= this.createCanvas(this.width, this.height);
    const ctx = this.maskedCanvas.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    const { x, y, width, height } = area;
    ctx.save();
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(this.buffer, x, y, width, height, x, y, width, height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, x, y, width, height, x, y, width, height);
    ctx.restore();
    return this.maskedCanvas;
  }

  /**
   * Write the finished stroke into its layer and reset for the next stroke.
   */
  private commit(active: ActiveStroke): void {
    const { layer, mode, preset, size, colour, isPen } = active.options;
    if (active.dirty) {
      const stroke: RecordedStroke = {
        mode,
        preset,
        size,
        colour,
        isPen,
        seed: active.seed,
        points: active.points,
      };
      this.dispatchEvent(
        new CustomEvent<StrokeCommitDetail>(BEFORE_COMMIT_EVENT, {
          detail: { layer, area: active.dirty, stroke },
        }),
      );
      this.mergeInto(active.options.layer.canvas, active, active.dirty, false);
      this.clearBuffer(active.dirty);
      this.changedArea = unionRect(this.changedArea, active.dirty);
    }
    this.active = undefined;
    this.dispatchEvent(new Event(STROKE_END_EVENT));
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Clear an area of the stroke buffer.
   */
  private clearBuffer(area: Rect | undefined): void {
    if (!area) return;
    const ctx = this.buffer.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    ctx.clearRect(area.x, area.y, area.width, area.height);
  }
}
