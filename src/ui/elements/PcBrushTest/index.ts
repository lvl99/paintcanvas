import { html, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { PcElement, defineElement } from "../../base";
import type { BrushConfig } from "../../../lib/brushes/types";
import type BrushTipCache from "../../../lib/brushes/BrushTipCache";
import StrokeEngine from "../../../lib/brushes/StrokeEngine";
import Layer, {
  createOffscreenCanvas,
  type CanvasFactory,
} from "../../../lib/classes/Layer";

/** Width of the testing area in pixels (double its displayed width, for a sharper picture) */
export const TEST_AREA_WIDTH = 800;

/** Height of the testing area in pixels (double its displayed height) */
export const TEST_AREA_HEIGHT = 320;

/** The colour test strokes are drawn in, whatever the current colour */
export const TEST_COLOUR = "#000000";

/** The colour of the circles showing a stroke's sampled points, while stroke points are shown */
export const POINT_COLOUR = "#e8175d";

/** The colour of the dots showing where a stroke placed its stamps, while stroke points are shown */
export const STAMP_COLOUR = "#1e88e5";

/** How long a finished stroke's points stay shown (milliseconds) */
export const STROKE_POINTS_MS = 3000;

/** Radius of the circles showing a stroke's sampled points (test area pixels) */
const POINT_RADIUS = 8;

/**
 * A small area to try brush settings before saving them: strokes are drawn in black, at the settings' own size, on a
 * white background at double resolution (800 × 320 pixels shown in the window's width). "Clear" (a red pill) empties it.
 * "Show stroke points" draws the stroke's sampled points (pink circles) and where it placed stamps (blue dots) over it,
 * like the canvas's debug overlay, to see how sampling and smoothing work. They go 3 seconds after the stroke ends, or
 * on "Clear".
 *
 * @example
 * html`<pc-brush-test .config=${config} .tips=${app.tips}></pc-brush-test>`
 */
export class PcBrushTest extends PcElement {
  static override properties = {
    ...PcElement.properties,
    config: { attribute: false },
    tips: { attribute: false },
    showPoints: { type: Boolean, attribute: "show-points" },
  };

  static override styles = [PcElement.styles, unsafeCSS(styles)];

  /** The settings to try */
  declare config?: BrushConfig;

  /** Brush shapes */
  declare tips?: BrushTipCache;

  /** Whether the last stroke's sampled points and stamps are drawn over it */
  declare showPoints: boolean;

  constructor() {
    super();
    this.showPoints = false;
  }

  /** Creates the layer and stroke canvases (replaceable for tests) */
  createCanvas: CanvasFactory = createOffscreenCanvas;

  private layer?: Layer;

  private engine?: StrokeEngine;

  /** The pointer drawing, if any */
  private pointerId?: number;

  private readonly onEngineChange = () => this.paint();

  /** Clears the finished stroke's points once they've been shown long enough */
  private pointsTimer?: ReturnType<typeof setTimeout>;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.pointsTimer);
    this.engine?.removeEventListener("change", this.onEngineChange);
  }

  /** The visible canvas */
  private get canvas(): HTMLCanvasElement | null {
    return this.renderRoot.querySelector("canvas");
  }

  /** The layer strokes are drawn on, and the engine drawing them (created on first use) */
  private get drawing(): { layer: Layer; engine: StrokeEngine } {
    this.layer ??= new Layer(
      { name: "Test" },
      TEST_AREA_WIDTH,
      TEST_AREA_HEIGHT,
      this.createCanvas,
    );
    if (!this.engine) {
      this.engine = new StrokeEngine(
        TEST_AREA_WIDTH,
        TEST_AREA_HEIGHT,
        this.createCanvas,
      );
      this.engine.addEventListener("change", this.onEngineChange);
      this.engine.setDebug(this.showPoints);
    }
    return { layer: this.layer, engine: this.engine };
  }

  /** A pointer's position in the area's pixels, with pen pressure and tilt */
  private point(event: PointerEvent) {
    const rect = (event.currentTarget as Element).getBoundingClientRect();
    const scale = rect.width ? TEST_AREA_WIDTH / rect.width : 1;
    return {
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
      ...(event.pointerType === "pen"
        ? {
            pressure: event.pressure,
            tiltX: event.tiltX,
            tiltY: event.tiltY,
          }
        : {}),
    };
  }

  /**
   * Start a test stroke.
   */
  private onPointerDown(event: PointerEvent): void {
    const config = this.config;
    if (!config || !this.tips || event.button !== 0) return;
    const { layer, engine } = this.drawing;
    clearTimeout(this.pointsTimer);
    this.pointerId = event.pointerId;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    engine.begin(
      {
        layer,
        mode: "paint",
        preset: config,
        size: { width: config.width ?? 1, height: config.height ?? 1 },
        colour: TEST_COLOUR,
        tip: this.tips.get(config),
        isPen: event.pointerType === "pen",
      },
      this.point(event),
      event.timeStamp,
    );
  }

  /** Continue the test stroke */
  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.engine?.move(this.point(event), event.timeStamp);
  }

  /** Finish the test stroke */
  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = undefined;
    this.engine?.end(this.point(event), event.timeStamp);
    this.paint();
    clearTimeout(this.pointsTimer);
    this.pointsTimer = setTimeout(() => this.clearPoints(), STROKE_POINTS_MS);
  }

  /** Stop showing the last stroke's points and stamps (still recording the next stroke's while shown) */
  private clearPoints(): void {
    clearTimeout(this.pointsTimer);
    this.engine?.setDebug(this.showPoints);
  }

  /**
   * Show or hide the last stroke's sampled points and stamps. They're recorded from the next stroke.
   */
  setShowPoints(shown: boolean): void {
    const changed = shown !== this.showPoints;
    this.showPoints = shown;
    if (changed) this.engine?.setDebug(shown);
    this.paint();
  }

  /**
   * Empty the testing area.
   */
  clear(): void {
    this.engine?.cancel();
    this.clearPoints();
    this.layer?.context.clearRect(0, 0, TEST_AREA_WIDTH, TEST_AREA_HEIGHT);
    this.paint();
  }

  /** Show the layer (with any stroke in progress) on the visible canvas */
  private paint(): void {
    const ctx = this.canvas?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, TEST_AREA_WIDTH, TEST_AREA_HEIGHT);
    const image = this.engine?.preview?.image ?? this.layer?.canvas;
    if (image) ctx.drawImage(image, 0, 0);
    if (this.showPoints && this.engine) this.paintPoints(ctx, this.engine);
  }

  /** Draw the last stroke's sampled points (circles) and stamp positions (dots) */
  private paintPoints(
    ctx: CanvasRenderingContext2D,
    engine: StrokeEngine,
  ): void {
    const { points, stamps } = engine.debugTrace;
    ctx.save();
    ctx.fillStyle = STAMP_COLOUR;
    for (const { x, y } of stamps) ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.strokeStyle = POINT_COLOUR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const { x, y } of points) {
      ctx.moveTo(x + POINT_RADIUS, y);
      ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  override render() {
    return html`
      <canvas
        width=${TEST_AREA_WIDTH}
        height=${TEST_AREA_HEIGHT}
        aria-label=${this.t("paintCanvas.brushConfig.testArea")}
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${this.onPointerUp}
        @pointercancel=${this.onPointerUp}
      ></canvas>
      <div class="actions">
        <button type="button" class="clear" @click=${() => this.clear()}>
          ${this.t("paintCanvas.common.clear")}
        </button>
        <label class="show-points">
          <input
            type="checkbox"
            .checked=${this.showPoints}
            @change=${(e: Event) =>
              this.setShowPoints((e.target as HTMLInputElement).checked)}
          />
          ${this.t("paintCanvas.brushConfig.showStrokePoints")}
        </label>
      </div>
    `;
  }
}

defineElement("pc-brush-test", PcBrushTest);
