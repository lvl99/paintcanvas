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

/**
 * A small area to try brush settings before saving them: strokes are drawn in black, at the settings' own size, on a
 * white background at double resolution (800 × 320 pixels shown in the window's width). "Clear" (a red pill) empties it.
 *
 * @example
 * html`<pc-brush-test .config=${config} .tips=${app.tips}></pc-brush-test>`
 */
export class PcBrushTest extends PcElement {
  static override properties = {
    ...PcElement.properties,
    config: { attribute: false },
    tips: { attribute: false },
  };

  static override styles = [PcElement.styles, unsafeCSS(styles)];

  /** The settings to try */
  declare config?: BrushConfig;

  /** Brush shapes */
  declare tips?: BrushTipCache;

  /** Creates the layer and stroke canvases (replaceable for tests) */
  createCanvas: CanvasFactory = createOffscreenCanvas;

  private layer?: Layer;

  private engine?: StrokeEngine;

  /** The pointer drawing, if any */
  private pointerId?: number;

  private readonly onEngineChange = () => this.paint();

  override disconnectedCallback(): void {
    super.disconnectedCallback();
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
  }

  /**
   * Empty the testing area.
   */
  clear(): void {
    this.engine?.cancel();
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
      <button type="button" class="clear" @click=${() => this.clear()}>
        ${this.t("paintCanvas.common.clear")}
      </button>
    `;
  }
}

defineElement("pc-brush-test", PcBrushTest);
