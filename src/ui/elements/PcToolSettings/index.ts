import { html, nothing, svg, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { PILLS_CSS as pill } from "../../styles";
import { ICON_CONTROLS_CSS as iconToggle } from "../../styles";
import { live } from "lit/directives/live.js";
import { styleMap } from "lit/directives/style-map.js";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import PaintCanvas, {
  Panel,
  Tool,
  type SampleMode,
} from "../../../lib/classes/PaintCanvas";
import type BrushSettings from "../../../lib/classes/BrushSettings";
import type { BrushConfig, BrushParamConfig } from "../../../lib/brushes/types";
import {
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
} from "../../../lib/classes/BrushSettings";
import type { TransformBox } from "../../../lib/transform/geometry";
import { MAX_ZOOM, MIN_ZOOM } from "../../../lib/classes/Viewport";
import { iconLabel } from "../../icons";
import "../PcBrushSize";
import { DRAG_THRESHOLD, PointerDrag } from "../../drag";

/** The lasso tools, which share the mask settings */
const MASK_TOOLS: readonly Tool[] = [
  Tool.RectangleLasso,
  Tool.CircleLasso,
  Tool.PolygonLasso,
  Tool.FreeformLasso,
];

/** Settings varied with pen pressure by the pressure toggle */
const PRESSURE_PARAMS = ["widthConfig", "heightConfig"] as const;

/** Settings varied with pen tilt by the tilt toggle */
const TILT_PARAMS = ["widthConfig", "heightConfig", "rotationConfig"] as const;

/** A setting's variation config key */
type ParamKey = (typeof TILT_PARAMS)[number];

/**
 * Whether a tool has settings to show in the bar.
 *
 * @example
 * hasToolSettings(Tool.Brush); // true
 * hasToolSettings(Tool.Pan); // false
 */
export const hasToolSettings = (tool: Tool): boolean =>
  tool === Tool.Brush ||
  tool === Tool.Eraser ||
  tool === Tool.Move ||
  tool === Tool.Zoom ||
  tool === Tool.ColourSample ||
  MASK_TOOLS.includes(tool);

/**
 * Turn pressure or tilt on or off for some of a brush's settings, keeping their ranges.
 *
 * @example
 * withSource(preset, ["widthConfig"], "usePressure", true); // { widthConfig: { ...preset.widthConfig, usePressure: true } }
 */
export const withSource = (
  preset: BrushConfig,
  params: readonly ParamKey[],
  source: "usePressure" | "useTilt",
  on: boolean,
): Partial<BrushConfig> =>
  Object.fromEntries(
    params.map((param) => [
      param,
      { ...preset[param], [source]: on } satisfies BrushParamConfig,
    ]),
  );

/**
 * An angle rounded to 2 decimal places.
 *
 * @example
 * roundAngle(12.3456); // 12.35
 */
export const roundAngle = (degrees: number): number =>
  Math.round(degrees * 100) / 100;

/** Steps of the zoom slider, across the whole zoom range */
export const ZOOM_SLIDER_STEPS = 1000;

/** How many times bigger the largest zoom is than the smallest */
const ZOOM_RANGE = MAX_ZOOM / MIN_ZOOM;

/**
 * A zoom level's position on the zoom slider (0 to ZOOM_SLIDER_STEPS). The scale is logarithmic, so each doubling of
 * the zoom takes the same room.
 *
 * @example
 * zoomToSlider(MIN_ZOOM); // 0
 * zoomToSlider(MAX_ZOOM); // 1000
 */
export const zoomToSlider = (zoom: number): number =>
  Math.round(
    (Math.log(zoom / MIN_ZOOM) / Math.log(ZOOM_RANGE)) * ZOOM_SLIDER_STEPS,
  );

/**
 * The zoom level at a position on the zoom slider (see `zoomToSlider`).
 *
 * @example
 * sliderToZoom(1000); // MAX_ZOOM
 */
export const sliderToZoom = (value: number): number =>
  MIN_ZOOM * ZOOM_RANGE ** (value / ZOOM_SLIDER_STEPS);

/**
 * A zoom level as a percentage, e.g. "150%" (to one decimal place below 10%).
 *
 * @example
 * zoomPercent(0.0625); // "6.3%"
 */
export const zoomPercent = (zoom: number): string => {
  const percent = zoom * 100;
  return `${percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent)}%`;
};

/** Read a number input, or undefined if it isn't a number */
const numberValue = (event: Event): number | undefined => {
  const value = (event.target as HTMLInputElement).valueAsNumber;
  return Number.isFinite(value) ? value : undefined;
};

/**
 * The bar of settings for the current tool, shown at the top of the canvas when the tool has any:
 *
 * - Brush and eraser: the preset (its name and shape; shows or hides the preset menu), the size (`pc-brush-size`, drag to
 *   resize), width, height (pressed and dragged right or up to grow, left or down to shrink; a press that barely moves
 *   focuses the field), constrain proportions, pressure, tilt, opacity and "Configure" (fires
 *   `pc-configure-brush` with the tool, "brush" or "eraser").
 * - Lassos: select all, and invert selection and deselect (only while there is a mask).
 * - Move, scale and rotate: width and height (in pixels or percent), constrain proportions, flip horizontal and vertical,
 *   angle (to 2 decimal places), rotate 90° left and right, and reset (undoes the whole transform).
 * - Colour sample: point sample (the pixel under the pointer) or area sample (the average of a dragged rectangle).
 * - Zoom: zoom in and out, a slider across the zoom range (logarithmic) with the zoom as a percentage, and reset (100%),
 *   all around the centre of the view.
 *
 * Changes to the brush or eraser apply to the current settings only, not the preset. Styling is structural only.
 *
 * @example
 * html`<pc-tool-settings .app=${app}></pc-tool-settings>`
 */
export class PcToolSettings extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    percent: { state: true },
  };

  static override styles = [
    PcElement.styles,

    unsafeCSS(iconToggle),
    unsafeCSS(pill),
    unsafeCSS(styles),
  ];

  declare app?: PaintCanvas;

  /** Whether the move tool's width and height are in percent (of the original size) instead of pixels */
  declare percent: boolean;

  private changes = new ChangeController(this, () => {
    const app = this.app;
    return app
      ? [
          app,
          app.brush,
          app.eraser,
          app.transform,
          app.selection,
          app.viewport,
          app.input,
        ]
      : [];
  });

  /** The brush or eraser settings whose width or height field is being pressed */
  private pressedSettings?: BrushSettings;

  /** Press-and-drag on the width field: right or up wider, left or down narrower */
  private readonly widthDrag = new PointerDrag((delta) => {
    const settings = this.pressedSettings as BrushSettings;
    settings.setSize(settings.width + delta, settings.height);
  }, DRAG_THRESHOLD);

  /** Press-and-drag on the height field: right or up taller, left or down shorter */
  private readonly heightDrag = new PointerDrag((delta) => {
    const settings = this.pressedSettings as BrushSettings;
    settings.setHeight(settings.height + delta);
  }, DRAG_THRESHOLD);

  constructor() {
    super();
    this.percent = false;
  }

  /**
   * Start pressing a size field. While the field isn't being typed in, the press doesn't focus it straight away: it
   * becomes a drag if the pointer moves far enough, or focuses the field when released (see `onSizeFieldPointerUp`).
   */
  private onSizeFieldPointerDown(
    drag: PointerDrag,
    settings: BrushSettings,
    event: PointerEvent,
  ): void {
    const input = event.currentTarget as HTMLInputElement;
    if (this.shadowRoot?.activeElement === input) return;
    event.preventDefault();
    this.pressedSettings = settings;
    drag.start(event);
  }

  /**
   * Finish pressing a size field: a press that didn't become a drag focuses the field for typing.
   */
  private onSizeFieldPointerUp(drag: PointerDrag, event: PointerEvent): void {
    const pressed = this.pressedSettings !== undefined;
    this.pressedSettings = undefined;
    if (!pressed || drag.end()) return;
    const input = event.currentTarget as HTMLInputElement;
    input.focus();
    input.select();
  }

  /** Press-and-drag handlers for a brush size field */
  private sizeFieldDrag(drag: PointerDrag, settings: BrushSettings) {
    return {
      down: (event: PointerEvent) =>
        this.onSizeFieldPointerDown(drag, settings, event),
      up: (event: PointerEvent) => this.onSizeFieldPointerUp(drag, event),
      cancel: () => {
        this.pressedSettings = undefined;
        drag.end();
      },
    };
  }

  /** Fire an event that crosses shadow DOM boundaries */
  private emit(type: string, detail?: unknown): void {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true }),
    );
  }

  /**
   * Change the move tool's box (as it is now, not as last shown), if there is one.
   */
  private changeBox(
    app: PaintCanvas,
    change: (box: TransformBox) => Partial<TransformBox>,
  ): void {
    const box = app.transform.box;
    if (box) app.transform.setBox({ ...box, ...change(box) });
  }

  /**
   * Render the focus pen mode toggle, on the right of every tool's settings: while on, only pens draw, and touches are
   * ignored while a pen is down or just lifted.
   */
  private renderFocusPen(app: PaintCanvas) {
    return html`<label
      class="icon-toggle focus-pen"
      title=${this.t("paintCanvas.toolSettings.focusPenHint")}
    >
      <input
        type="checkbox"
        .checked=${live(app.input.data.focusPen)}
        @change=${(e: Event) =>
          app.input.update({
            focusPen: (e.target as HTMLInputElement).checked,
          })}
      />
      ${iconLabel(this.iconUrl("focusPen"), this.t("paintCanvas.toolSettings.focusPen"))}
    </label>`;
  }

  /** Render the brush or eraser settings */
  private renderBrush(
    app: PaintCanvas,
    settings: BrushSettings,
    kind: "brush" | "eraser",
  ) {
    const preset = settings.preset;
    const pressure = PRESSURE_PARAMS.some(
      (param) => preset[param]?.usePressure,
    );
    const tilt = TILT_PARAMS.some((param) => preset[param]?.useTilt);
    const label = this.t(
      kind === "eraser" ? "paintCanvas.tool.eraser" : "paintCanvas.tool.brush",
    );
    const panel = kind === "eraser" ? Panel.Eraser : Panel.Brush;
    const width = this.sizeFieldDrag(this.widthDrag, settings);
    const height = this.sizeFieldDrag(this.heightDrag, settings);
    return html`<div
      role="toolbar"
      aria-label=${this.t("paintCanvas.toolSettings.settings", { tool: label })}
    >
      <button
        type="button"
        class="preset"
        data-panel=${panel}
        title=${this.t("paintCanvas.toolSettings.presets", { tool: label })}
        aria-expanded=${app.panel === panel ? "true" : "false"}
        @click=${() => app.togglePanel(panel)}
      >
        <span
          class=${preset.image ? "shape-preview image" : "shape-preview"}
          style=${styleMap({
            maskImage:
              typeof preset.image === "string"
                ? `url("${preset.image}")`
                : undefined,
          })}
        ></span>
        ${preset.name ?? preset.id}
      </button>
      <pc-brush-size
        class="size"
        .settings=${settings}
        label=${this.t("paintCanvas.brushMenu.size", { tool: label })}
      ></pc-brush-size>
      <label>
        ${this.t("paintCanvas.common.width")}
        <input
          type="number"
          class="width drag-field"
          min=${MIN_BRUSH_SIZE}
          max=${MAX_BRUSH_SIZE}
          .value=${String(settings.width)}
          @pointerdown=${width.down}
          @pointermove=${this.widthDrag.move}
          @pointerup=${width.up}
          @pointercancel=${width.cancel}
          @change=${(e: Event) => {
            const value = numberValue(e);
            if (value !== undefined) settings.setSize(value, settings.height);
          }}
        />
      </label>
      <label
        class="icon-toggle"
        title=${this.t("paintCanvas.toolSettings.constrainProportions")}
      >
        <input
          type="checkbox"
          class="constrain"
          .checked=${preset.constrainProportions ?? false}
          @change=${(e: Event) =>
            settings.update({
              constrainProportions: (e.target as HTMLInputElement).checked,
            })}
        />
        ${iconLabel(this.iconUrl(preset.constrainProportions ? "linked" : "unlinked"), this.t("paintCanvas.toolSettings.constrainProportions"))}
      </label>
      <label>
        ${this.t("paintCanvas.common.height")}
        <input
          type="number"
          class="height drag-field"
          min=${MIN_BRUSH_SIZE}
          max=${MAX_BRUSH_SIZE}
          .value=${String(settings.height)}
          @pointerdown=${height.down}
          @pointermove=${this.heightDrag.move}
          @pointerup=${height.up}
          @pointercancel=${height.cancel}
          @change=${(e: Event) => {
            const value = numberValue(e);
            if (value !== undefined) settings.setHeight(value);
          }}
        />
      </label>
      <label
        class="icon-toggle"
        title=${this.t("paintCanvas.toolSettings.pressure")}
      >
        <input
          type="checkbox"
          class="pressure"
          .checked=${pressure}
          @change=${(e: Event) =>
            settings.update(
              withSource(
                preset,
                PRESSURE_PARAMS,
                "usePressure",
                (e.target as HTMLInputElement).checked,
              ),
            )}
        />
        ${iconLabel(this.iconUrl("pressure"), this.t("paintCanvas.toolSettings.pressure"))}
      </label>
      <label
        class="icon-toggle"
        title=${this.t("paintCanvas.toolSettings.tilt")}
      >
        <input
          type="checkbox"
          class="tilt"
          .checked=${tilt}
          @change=${(e: Event) =>
            settings.update(
              withSource(
                preset,
                TILT_PARAMS,
                "useTilt",
                (e.target as HTMLInputElement).checked,
              ),
            )}
        />
        ${iconLabel(this.iconUrl("tilt"), this.t("paintCanvas.toolSettings.tilt"))}
      </label>
      <label>
        ${this.t("paintCanvas.common.opacity")}
        <input
          type="number"
          class="opacity"
          min="0"
          max="100"
          .value=${String(Math.round((preset.alpha ?? 1) * 100))}
          @change=${(e: Event) => {
            const value = numberValue(e);
            if (value !== undefined)
              settings.update({
                alpha: Math.max(0, Math.min(100, value)) / 100,
              });
          }}
        />
        <span class="unit">%</span>
      </label>
      <button
        type="button"
        class="configure"
        @click=${() => this.emit("pc-configure-brush", kind)}
      >
        ${this.t("paintCanvas.toolSettings.configure")}
      </button>
      ${this.renderFocusPen(app)}
    </div>`;
  }

  /** Render the mask settings */
  private renderMask(app: PaintCanvas) {
    return html`<div
      role="toolbar"
      aria-label=${this.t("paintCanvas.toolSettings.maskSettings")}
    >
      <button
        type="button"
        class="pill select-all"
        @click=${() => app.selection.selectAll()}
      >
        ${this.t("paintCanvas.toolSettings.selectAll")}
      </button>
      <button
        type="button"
        class="pill invert"
        ?disabled=${!app.selection.active}
        @click=${() => app.selection.invert()}
      >
        ${this.t("paintCanvas.toolSettings.invertSelection")}
      </button>
      <button
        type="button"
        class="pill deselect"
        ?disabled=${!app.selection.active}
        @click=${() => app.selection.clear()}
      >
        ${this.t("paintCanvas.toolSettings.deselect")}
      </button>
      ${this.renderFocusPen(app)}
    </div>`;
  }

  /**
   * Resize the move tool's box to a width or height (in the current unit), keeping flips, and the other side in
   * proportion when constrained.
   */
  private resizeBox(app: PaintCanvas, side: "width" | "height", value: number) {
    const { box, source } = app.transform;
    if (!box || !source) return;
    const pixels = this.percent ? (source[side] * value) / 100 : value;
    if (pixels <= 0) return;
    const other = side === "width" ? "height" : "width";
    const ratio = Math.abs(box[other] / box[side]);
    app.transform.setBox({
      ...box,
      [side]: Math.sign(box[side]) * pixels,
      ...(app.constrainProportions
        ? { [other]: Math.sign(box[other]) * pixels * ratio }
        : {}),
    });
  }

  /** A box side in the current unit, for an input */
  private sideValue(
    box: TransformBox,
    source: { width: number; height: number },
    side: "width" | "height",
  ) {
    const pixels = Math.abs(box[side]);
    return String(
      Math.round(this.percent ? (pixels / source[side]) * 100 : pixels),
    );
  }

  /** Render the move, scale and rotate settings */
  private renderMove(app: PaintCanvas) {
    const { box, source } = app.transform;
    const disabled = !box || !source;
    const side = (name: "width" | "height", label: string) =>
      html`<label>
        ${label}
        <input
          type="number"
          class=${name}
          min="1"
          ?disabled=${disabled}
          .value=${box && source ? this.sideValue(box, source, name) : ""}
          @change=${(e: Event) => {
            const value = numberValue(e);
            if (value !== undefined) this.resizeBox(app, name, value);
          }}
        />
      </label>`;
    const rotate = (by: (rotation: number) => number) =>
      this.changeBox(app, (current) => ({
        rotation: by(current.rotation) % 360,
      }));
    return html`<div
      role="toolbar"
      aria-label=${this.t("paintCanvas.toolSettings.settings", { tool: this.t("paintCanvas.tool.move") })}
    >
      ${side("width", this.t("paintCanvas.common.width"))}
      <label
        class="icon-toggle"
        title=${this.t("paintCanvas.toolSettings.constrainProportions")}
      >
        <input
          type="checkbox"
          class="constrain"
          .checked=${live(app.constrainProportions)}
          @change=${(e: Event) =>
            app.setConstrainProportions((e.target as HTMLInputElement).checked)}
        />
        ${iconLabel(this.iconUrl(app.constrainProportions ? "linked" : "unlinked"), this.t("paintCanvas.toolSettings.constrainProportions"))}
      </label>
      ${side("height", this.t("paintCanvas.common.height"))}
      <label>
        <input
          type="checkbox"
          class="percent"
          .checked=${this.percent}
          @change=${(e: Event) =>
            (this.percent = (e.target as HTMLInputElement).checked)}
        />
        ${this.t("paintCanvas.toolSettings.percent")}
      </label>
      <button
        type="button"
        class="icon-button flip-horizontal"
        title=${this.t("paintCanvas.toolSettings.flipHorizontal")}
        ?disabled=${disabled}
        @click=${() =>
          this.changeBox(app, (current) => ({ width: -current.width }))}
      >
        ${iconLabel(this.iconUrl("flipHorizontal"), this.t("paintCanvas.toolSettings.flipHorizontal"))}
      </button>
      <button
        type="button"
        class="icon-button flip-vertical"
        title=${this.t("paintCanvas.toolSettings.flipVertical")}
        ?disabled=${disabled}
        @click=${() =>
          this.changeBox(app, (current) => ({ height: -current.height }))}
      >
        ${iconLabel(this.iconUrl("flipVertical"), this.t("paintCanvas.toolSettings.flipVertical"))}
      </button>
      <label>
        ${this.t("paintCanvas.toolSettings.angle")}
        <input
          type="number"
          class="angle"
          step="0.01"
          ?disabled=${disabled}
          .value=${box ? String(roundAngle(box.rotation)) : ""}
          @change=${(e: Event) => {
            const value = numberValue(e);
            if (value !== undefined) rotate(() => roundAngle(value));
          }}
        />
        <span class="unit">°</span>
      </label>
      <button
        type="button"
        class="icon-button rotate-left"
        title=${this.t("paintCanvas.toolSettings.rotateLeft")}
        ?disabled=${disabled}
        @click=${() => rotate((rotation) => rotation - 90)}
      >
        ${iconLabel(this.iconUrl("rotate90Left"), this.t("paintCanvas.toolSettings.rotateLeft"))}
      </button>
      <button
        type="button"
        class="icon-button rotate-right"
        title=${this.t("paintCanvas.toolSettings.rotateRight")}
        ?disabled=${disabled}
        @click=${() => rotate((rotation) => rotation + 90)}
      >
        ${iconLabel(this.iconUrl("rotate90Right"), this.t("paintCanvas.toolSettings.rotateRight"))}
      </button>
      <button
        type="button"
        class="pill reset"
        ?disabled=${disabled}
        @click=${() => app.cancelTransform()}
      >
        ${this.t("paintCanvas.toolSettings.reset")}
      </button>
      ${this.renderFocusPen(app)}
    </div>`;
  }

  /** Render the zoom settings */
  private renderZoom(app: PaintCanvas) {
    const view = app.viewport;
    const centre = { x: view.width / 2, y: view.height / 2 };
    return html`<div
      role="toolbar"
      aria-label=${this.t("paintCanvas.toolSettings.settings", { tool: this.t("paintCanvas.tool.zoom") })}
    >
      <button
        type="button"
        class="zoom-in"
        title=${this.t("paintCanvas.toolSettings.zoomIn")}
        aria-label=${this.t("paintCanvas.toolSettings.zoomIn")}
        ?disabled=${view.zoom >= MAX_ZOOM}
        @click=${() => view.zoomIn(centre)}
      >
        <img src=${this.iconUrl("zoomIn")} alt="" />
      </button>
      <button
        type="button"
        class="zoom-out"
        title=${this.t("paintCanvas.toolSettings.zoomOut")}
        aria-label=${this.t("paintCanvas.toolSettings.zoomOut")}
        ?disabled=${view.zoom <= MIN_ZOOM}
        @click=${() => view.zoomOut(centre)}
      >
        <img src=${this.iconUrl("zoomOut")} alt="" />
      </button>
      <label>
        ${this.t("paintCanvas.tool.zoom")}
        <input
          type="range"
          class="zoom"
          min="0"
          max=${ZOOM_SLIDER_STEPS}
          step="1"
          .value=${String(zoomToSlider(view.zoom))}
          @input=${(e: Event) =>
            view.zoomAt(
              centre,
              sliderToZoom((e.target as HTMLInputElement).valueAsNumber),
            )}
        />
        <output>${zoomPercent(view.zoom)}</output>
      </label>
      <button
        type="button"
        class="pill reset"
        @click=${() => view.zoomAt(centre, 1)}
      >
        ${this.t("paintCanvas.toolSettings.reset")}
      </button>
      ${this.renderFocusPen(app)}
    </div>`;
  }

  /** Render the colour sample tool's settings: point or area sampling */
  private renderColourSample(app: PaintCanvas) {
    const modes: [SampleMode, string, unknown][] = [
      [
        "point",
        this.t("paintCanvas.toolSettings.pointSample"),
        // A target
        svg`<circle cx="10" cy="10" r="6" /><circle cx="10" cy="10" r="1.5" fill="currentColor" /><path d="M10 1 V5 M10 15 V19 M1 10 H5 M15 10 H19" />`,
      ],
      [
        "area",
        this.t("paintCanvas.toolSettings.areaSample"),
        // A rectangle filled with a gradient
        svg`<defs><linearGradient id="area-gradient"><stop offset="0" stop-color="currentColor" stop-opacity="0" /><stop offset="1" stop-color="currentColor" /></linearGradient></defs><rect x="2" y="4" width="16" height="12" fill="url(#area-gradient)" />`,
      ],
    ];
    return html`<div
      role="toolbar"
      aria-label=${this.t("paintCanvas.toolSettings.settings", { tool: this.t("paintCanvas.tool.colourSample") })}
    >
      ${modes.map(
        ([mode, label, icon]) =>
          html`<button
            type="button"
            class="sample-${mode}"
            title=${label}
            aria-label=${label}
            aria-pressed=${app.sampleMode === mode ? "true" : "false"}
            @click=${() => app.setSampleMode(mode)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              ${icon}
            </svg>
          </button>`,
      )}
      ${this.renderFocusPen(app)}
    </div>`;
  }

  override render() {
    const app = this.app;
    if (!app) return nothing;
    switch (app.tool) {
      case Tool.Brush:
        return this.renderBrush(app, app.brush, "brush");
      case Tool.Eraser:
        return this.renderBrush(app, app.eraser, "eraser");
      case Tool.Move:
        return this.renderMove(app);
      case Tool.Zoom:
        return this.renderZoom(app);
      case Tool.ColourSample:
        return this.renderColourSample(app);
      default:
        return MASK_TOOLS.includes(app.tool) ? this.renderMask(app) : nothing;
    }
  }
}

defineElement("pc-tool-settings", PcToolSettings);
