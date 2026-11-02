import { html, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { NO_TEXT_SELECTION_CSS as noTextSelection } from "../../styles";
import { styleMap } from "lit/directives/style-map.js";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import type { Insets, Rect } from "../../../lib/classes/Viewport";
import { interfaceInsets } from "../PcCanvas";
import { drawFlattened } from "../../../lib/rendering/compositing";
import { fitSize } from "../../../lib/rendering/checkerboard";

/** Largest map width or height in CSS pixels */
export const MAP_SIZE = 90;

/** Shortest time between thumbnail redraws, in milliseconds (redrawing the whole canvas is slow) */
export const MAP_REDRAW_INTERVAL = 250;

/**
 * Convert the visible area into percentage offsets and sizes within the map, clamped to the canvas.
 *
 * @example
 * viewportFrame({ x: 500, y: 0, width: 1000, height: 1000 }, 2000, 2000);
 * // { left: 25, top: 0, width: 50, height: 50 }
 */
export const viewportFrame = (
  viewport: Rect,
  canvasWidth: number,
  canvasHeight: number,
) => {
  const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
  const left = clampPercent((viewport.x / canvasWidth) * 100);
  const top = clampPercent((viewport.y / canvasHeight) * 100);
  return {
    left,
    top,
    width:
      clampPercent(((viewport.x + viewport.width) / canvasWidth) * 100) - left,
    height:
      clampPercent(((viewport.y + viewport.height) / canvasHeight) * 100) - top,
  };
};

/**
 * Canvas map: a small live picture of the whole canvas with a frame showing the part the user can see.
 * Clicking or dragging on the map moves the view there.
 *
 * @example
 * html`<pc-canvas-map .app=${app}></pc-canvas-map>`
 */
export class PcCanvasMap extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    insets: { attribute: false },
  };

  static override styles = [
    PcElement.styles,
    unsafeCSS(noTextSelection),
    unsafeCSS(styles),
  ];

  declare app?: PaintCanvas;

  /**
   * Space covered by the interface on each side (CSS pixels), kept clear when fitting or centring the canvas. Without
   * it, a toolbar on the left and (with the interface shown) a panel taking 37.5% on the right are assumed.
   */
  declare insets?: Insets;

  /** The insets in effect (see `insets`) */
  private get activeInsets(): Insets {
    const app = this.app as PaintCanvas;
    return (
      this.insets ?? interfaceInsets(app.viewport.width, app.interfaceVisible)
    );
  }

  /** Device pixels per CSS pixel (replaceable for tests) */
  pixelRatio = () => window.devicePixelRatio || 1;

  // The view only moves the frame, so it re-renders this component; layer changes redraw the thumbnail instead
  private changes = new ChangeController(this, () => [
    this.app,
    this.app?.viewport,
  ]);

  private watchedLayers?: EventTarget;

  /** Other people's drawings in a session, which also change the thumbnail */
  private watchedRemote?: EventTarget;

  private readonly onLayersChange = () => this.scheduleThumbnail();

  private lastDrawn = 0;

  private pendingDraw?: ReturnType<typeof setTimeout>;

  private dragging = false;

  /** The thumbnail canvas */
  get canvas(): HTMLCanvasElement | null {
    return this.renderRoot.querySelector("canvas");
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.watchLayers(undefined);
    clearTimeout(this.pendingDraw);
    this.pendingDraw = undefined;
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    const app = this.app;
    if (!app) return;
    const size = fitSize(app.width, app.height, MAP_SIZE, MAP_SIZE);
    this.style.width = `${size.width}px`;
    this.style.height = `${size.height}px`;
  }

  override updated(): void {
    const layers = this.app?.layers;
    if (layers !== this.watchedLayers) {
      this.watchLayers(layers);
      this.drawThumbnail();
    }
  }

  /**
   * Listen for changes to a layer stack (replacing any previous one).
   */
  private watchLayers(layers: EventTarget | undefined): void {
    this.watchedLayers?.removeEventListener("change", this.onLayersChange);
    this.watchedLayers = layers;
    layers?.addEventListener("change", this.onLayersChange);
    const remote = layers ? this.app?.external : undefined;
    this.watchedRemote?.removeEventListener("change", this.onLayersChange);
    this.watchedRemote = remote;
    remote?.addEventListener("change", this.onLayersChange);
  }

  /**
   * Redraw the thumbnail soon, no more often than `MAP_REDRAW_INTERVAL`, once drawing pauses (see `BackgroundWork`).
   */
  scheduleThumbnail(): void {
    if (this.pendingDraw) return;
    const wait = Math.max(0, this.lastDrawn + MAP_REDRAW_INTERVAL - Date.now());
    this.pendingDraw = setTimeout(() => {
      this.pendingDraw = undefined;
      this.app?.background.run("map", () => this.drawThumbnail());
    }, wait);
  }

  /**
   * Draw the whole canvas into the map now.
   */
  drawThumbnail(): void {
    const app = this.app;
    const canvas = this.canvas;
    if (!app || !canvas) return;
    const size = fitSize(app.width, app.height, MAP_SIZE, MAP_SIZE);
    const ratio = this.pixelRatio();
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFlattened(
      ctx,
      app.drawables,
      app.width,
      app.height,
      canvas.width,
      canvas.height,
    );
    this.lastDrawn = Date.now();
  }

  /**
   * Move the view to the canvas point under a pointer on the map.
   */
  private moveViewTo(event: PointerEvent): void {
    const app = this.app;
    if (!app) return;
    const rect = this.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * app.width;
    const y = ((event.clientY - rect.top) / rect.height) * app.height;
    app.viewport.centreOn({ x, y }, this.activeInsets);
  }

  /**
   * Start moving the view.
   */
  private onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.moveViewTo(event);
  }

  /**
   * Keep moving the view while dragging.
   */
  private onPointerMove(event: PointerEvent): void {
    if (this.dragging) this.moveViewTo(event);
  }

  override render() {
    const app = this.app;
    const frame = app
      ? viewportFrame(app.viewport.visibleRect(), app.width, app.height)
      : { left: 0, top: 0, width: 100, height: 100 };
    return html`
      <canvas
        aria-label=${this.t("canvas.map")}
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${() => (this.dragging = false)}
        @pointercancel=${() => (this.dragging = false)}
      ></canvas>
      <div
        class="frame"
        style=${styleMap({
          left: `${frame.left}%`,
          top: `${frame.top}%`,
          width: `${frame.width}%`,
          height: `${frame.height}%`,
        })}
      ></div>
    `;
  }
}

defineElement("pc-canvas-map", PcCanvasMap);
