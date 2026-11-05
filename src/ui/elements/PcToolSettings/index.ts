import { html, nothing, svg, unsafeCSS, type PropertyValues } from "lit";
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
import "../PcNumberSlider";
import "../PcPopover";
import "../PcContextMenu";
import type { MenuItem } from "../PcMenu";
import type { PcPopover } from "../PcPopover";

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

/** An action in the bar: a button, or at its end an item of its ⋮ menu while narrow */
interface EndAction {
  /** Its class and menu value, e.g. "copy" */
  name: string;
  label: string;
  /** Its tooltip (the label by default) */
  title?: string;
  /** An icon shown instead of the label on its button */
  icon?: string;
  /** Whether it's a toggle that's on (or off); undefined when it isn't a toggle */
  pressed?: boolean;
  disabled?: boolean;
  run(): void;
}

/** How a setting's `pc-number-slider` works (see `renderNumberField`) */
interface NumberFieldOptions {
  min?: number;
  max?: number;
  unit?: string;
  step?: number;
  dragStep?: number;
  /** Shown instead of the value */
  text?: string;
  disabled?: boolean;
}

/** A tool's settings in the bar */
interface ToolView {
  /** Names the bar for screen readers */
  label: string;
  /** The settings at the start of the bar */
  start: unknown;
  /** The actions at its end */
  end: readonly EndAction[];
  /** Shown after the bar (e.g. a popover) */
  after?: unknown;
}

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

/** Largest width or height the move tool's fields go to (pixels or percent) */
export const MAX_MOVE_SIZE = 10000;

/** Shown in a move tool field while there's nothing to move */
const NO_VALUE = "–";

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

/**
 * The bar of settings for the current tool, shown at the top of the canvas when the tool has any. The tool's settings
 * are at the start (part `start`) and its actions at the end, on the right (part `end`); the `start` and `end` slots
 * add your own after them. While `narrow` (set by `<paint-canvas>` while its layout is narrow), several actions at the
 * end become one ⋮ menu (`pc-context-menu`).
 *
 * - Brush and eraser: the preset (its name and shape; shows or hides the preset menu), the size (`pc-brush-size`), the
 *   size settings (a cog button that shows or hides a popover under it with the width, constrain proportions and
 *   height), pressure, tilt, opacity and "Configure" (fires `pc-configure-brush` with the tool, "brush" or "eraser").
 *   The size, width, height and opacity are `pc-number-slider`s: pressed and dragged right or up to raise them, left or
 *   down to lower them, or tapped to type a value. Focus pen mode (only pens draw, and touches are ignored while a pen
 *   is down or just lifted) follows tilt. At the end: cut, copy and paste, as for the lassos.
 * - Lassos: select all, and invert selection and deselect (only while there is a mask). At the end: cut and copy (while
 *   there is a mask) and paste (while there is copied image data).
 * - Move, scale and rotate: width and height (in pixels or percent), constrain proportions, flip horizontal and vertical,
 *   angle (to 2 decimal places), rotate 90° left and right, and reset (undoes the whole transform). The width, height
 *   and angle are `pc-number-slider`s. At the end: cut, copy and paste, as for the lassos.
 * - Colour sample: point sample (the pixel under the pointer) or area sample (the average of a dragged rectangle).
 * - Zoom: zoom in and out, a slider across the zoom range (logarithmic) with the zoom as a percentage, and reset (100%),
 *   all around the centre of the view.
 *
 * Changes to the brush or eraser apply to the current settings only, not the preset. Styling is structural only.
 *
 * @example
 * html`<pc-tool-settings .app=${app} ?narrow=${narrow}>
 *   <button slot="end" @click=${share}>Share</button>
 * </pc-tool-settings>`
 */
export class PcToolSettings extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    percent: { state: true },
    sizeOpen: { state: true },
    narrow: { type: Boolean, reflect: true },
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

  /** Whether the layout is narrow: the actions at the end of the bar become a ⋮ menu */
  declare narrow: boolean;

  /** Whether the brush or eraser's size settings (width, height, constrain proportions) are shown */
  declare sizeOpen: boolean;

  // The size settings follow their button when the bar or page scrolls, or the window resizes
  private readonly placeSizeSettings = () => this.sizePopover?.placeBelow();

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

  constructor() {
    super();
    this.percent = false;
    this.sizeOpen = false;
    this.narrow = false;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.listenWhileSizeOpen(false);
  }

  /** The size settings' popover, while a brush or eraser's settings are shown */
  private get sizePopover(): PcPopover | null {
    return this.renderRoot.querySelector<PcPopover>("pc-popover.size-popover");
  }

  /** Follow the window's scrolling and resizing (or stop) */
  private listenWhileSizeOpen(open: boolean): void {
    const method = open ? "addEventListener" : "removeEventListener";
    window[method]("scroll", this.placeSizeSettings, true);
    window[method]("resize", this.placeSizeSettings);
  }

  /**
   * Hide the size settings (e.g. on Escape or a press outside them), returning focus to their button if it was in them.
   */
  private closeSizeSettings(): void {
    const popover = this.sizePopover as PcPopover;
    const focusWasInside = popover.matches(":focus-within");
    this.sizeOpen = false;
    if (focusWasInside)
      this.renderRoot.querySelector<HTMLElement>(".size-settings")?.focus();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    const tool = this.app?.tool;
    // Only the brush and eraser have size settings
    if (tool !== Tool.Brush && tool !== Tool.Eraser) this.sizeOpen = false;
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (!changed.has("sizeOpen")) return;
    this.listenWhileSizeOpen(this.sizeOpen);
    if (this.sizeOpen) void this.showSizeSettings();
  }

  /** Put the opened size settings under their button, once they can be measured */
  private async showSizeSettings(): Promise<void> {
    const popover = this.sizePopover as PcPopover;
    // Pressing the button isn't pressing outside the popover
    popover.anchor = this.renderRoot.querySelector(".size-settings") as Element;
    await popover.updateComplete;
    popover.placeBelow();
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
   * The focus pen mode toggle, for the brush and eraser: while on, only pens draw, and touches are ignored while a pen is
   * down or just lifted.
   */
  private focusPenAction(app: PaintCanvas): EndAction {
    const on = app.input.data.focusPen;
    return {
      name: "focus-pen",
      label: this.t("paintCanvas.toolSettings.focusPen"),
      title: this.t("paintCanvas.toolSettings.focusPenHint"),
      icon: "focusPen",
      pressed: on,
      run: () => app.input.update({ focusPen: !on }),
    };
  }

  /**
   * Cut, copy (while there's a mask, and no transform is pending) and paste (while there's copied image data).
   */
  private clipboardActions(app: PaintCanvas): EndAction[] {
    const noCopy = !app.selection.active || app.transform.pending;
    return [
      {
        name: "cut",
        label: this.t("paintCanvas.common.cut"),
        disabled: noCopy,
        run: () => app.cut(),
      },
      {
        name: "copy",
        label: this.t("paintCanvas.common.copy"),
        disabled: noCopy,
        run: () => app.copy(),
      },
      {
        name: "paste",
        label: this.t("paintCanvas.common.paste"),
        disabled: !app.hasClipboard,
        run: () => app.paste(),
      },
    ];
  }

  /**
   * Render the actions at the end of the bar: as buttons, or while narrow (and there's more than one) as a ⋮ menu.
   */
  private renderEnd(actions: readonly EndAction[]) {
    if (this.narrow && actions.length > 1)
      return html`<pc-context-menu
        class="more"
        label=${this.t("paintCanvas.toolSettings.moreActions")}
        .items=${actions.map((action): MenuItem => ({
          value: action.name,
          label: action.label,
          disabled: action.disabled,
          icon: action.icon,
          selected: action.pressed,
        }))}
        @pc-select=${(event: CustomEvent<{ value: string }>) =>
          actions.find((action) => action.name === event.detail.value)?.run()}
      ></pc-context-menu>`;
    return actions.map((action) => this.renderActionButton(action));
  }

  /** Render an action as a button: its icon (named for screen readers) or its label */
  private renderActionButton(action: EndAction) {
    return html`<button
      type="button"
      class=${action.icon ? `${action.name} icon-button` : `${action.name} pill`}
      title=${action.title ?? action.label}
      aria-label=${action.icon ? action.label : nothing}
      aria-pressed=${
        action.pressed === undefined ? nothing : String(action.pressed)
      }
      ?disabled=${action.disabled}
      @click=${action.run}
    >
      ${
        action.icon
          ? html`<img src=${this.iconUrl(action.icon)} alt="" />`
          : action.label
      }
    </button>`;
  }

  /**
   * Render a setting as a named `pc-number-slider` (dragged or typed), from 1 to 256 pixels unless given another range.
   */
  private renderNumberField(
    name: string,
    label: string,
    value: number,
    change: (value: number) => void,
    {
      min = MIN_BRUSH_SIZE,
      max = MAX_BRUSH_SIZE,
      unit = "",
      step = 1,
      dragStep = step,
      text = "",
      disabled = false,
    }: NumberFieldOptions = {},
  ) {
    return html`<div class="field">
      <span aria-hidden="true">${label}</span>
      <pc-number-slider
        class=${name}
        min=${min}
        max=${max}
        step=${step}
        drag-step=${dragStep}
        unit=${unit}
        label=${label}
        .text=${text}
        ?disabled=${disabled}
        .value=${live(value)}
        @pc-change=${(e: CustomEvent<{ value: number }>) => {
          change(e.detail.value);
          // Show the value it got, which can differ (e.g. the other side reached a limit)
          this.requestUpdate();
        }}
      ></pc-number-slider>
    </div>`;
  }

  /** Render the brush or eraser settings */
  private renderBrush(
    app: PaintCanvas,
    settings: BrushSettings,
    kind: "brush" | "eraser",
  ): ToolView {
    const preset = settings.preset;
    const pressure = PRESSURE_PARAMS.some(
      (param) => preset[param]?.usePressure,
    );
    const tilt = TILT_PARAMS.some((param) => preset[param]?.useTilt);
    const label = this.t(
      kind === "eraser" ? "paintCanvas.tool.eraser" : "paintCanvas.tool.brush",
    );
    const panel = kind === "eraser" ? Panel.Eraser : Panel.Brush;
    const sizeSettings = this.t("paintCanvas.toolSettings.sizeSettings");
    return {
      label: this.t("paintCanvas.toolSettings.settings", { tool: label }),
      end: this.clipboardActions(app),
      start: html`<button
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
        <div class="field">
          <span aria-hidden="true">${this.t("paintCanvas.common.size")}</span>
          <pc-brush-size
            class="size"
            .settings=${settings}
            label=${this.t("paintCanvas.brushMenu.size", { tool: label })}
          ></pc-brush-size>
        </div>
        <button
          type="button"
          class="size-settings"
          title=${sizeSettings}
          aria-label=${sizeSettings}
          aria-haspopup="dialog"
          aria-expanded=${this.sizeOpen ? "true" : "false"}
          @click=${() => (this.sizeOpen = !this.sizeOpen)}
        >
          <img src=${this.iconUrl("cog")} alt="" />
        </button>
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
        ${this.renderActionButton(this.focusPenAction(app))}
        ${this.renderNumberField(
          "opacity",
          this.t("paintCanvas.common.opacity"),
          Math.round((preset.alpha ?? 1) * 100),
          (value) => settings.update({ alpha: value / 100 }),
          { min: 0, max: 100, unit: "%" },
        )}
        <button
          type="button"
          class="configure"
          @click=${() => this.emit("pc-configure-brush", kind)}
        >
          ${this.t("paintCanvas.toolSettings.configure")}
        </button>`,
      after: html`<pc-popover
        class="size-popover"
        arrow
        label=${sizeSettings}
        ?open=${this.sizeOpen}
        @pc-close=${this.closeSizeSettings}
      >
        <div class="size-fields">
          ${this.renderNumberField(
            "width",
            this.t("paintCanvas.common.width"),
            settings.width,
            (value) => settings.setSize(value, settings.height),
          )}
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
          ${this.renderNumberField(
            "height",
            this.t("paintCanvas.common.height"),
            settings.height,
            (value) => settings.setHeight(value),
          )}
        </div>
      </pc-popover>`,
    };
  }

  /** Render the mask settings */
  private renderMask(app: PaintCanvas): ToolView {
    return {
      label: this.t("paintCanvas.toolSettings.maskSettings"),
      end: this.clipboardActions(app),
      start: html`<button
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
        </button>`,
    };
  }

  /**
   * Resize the move tool's box to a width or height (in the current unit), keeping flips, and the other side in
   * proportion when constrained.
   */
  private resizeBox(app: PaintCanvas, side: "width" | "height", value: number) {
    const { box, source } = app.transform;
    if (!box || !source) return;
    // At least 1 (the fields' smallest value)
    const pixels = this.percent ? (source[side] * value) / 100 : value;
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

  /** A box side in the current unit (pixels or percent) */
  private sideValue(
    box: TransformBox,
    source: { width: number; height: number },
    side: "width" | "height",
  ): number {
    const pixels = Math.abs(box[side]);
    return Math.round(this.percent ? (pixels / source[side]) * 100 : pixels);
  }

  /** Render the move, scale and rotate settings */
  private renderMove(app: PaintCanvas): ToolView {
    const { box, source } = app.transform;
    const disabled = !box || !source;
    const side = (name: "width" | "height", label: string) =>
      this.renderNumberField(
        name,
        label,
        box && source ? this.sideValue(box, source, name) : 0,
        (value) => this.resizeBox(app, name, value),
        {
          max: MAX_MOVE_SIZE,
          unit: this.percent ? "%" : "",
          text: disabled ? NO_VALUE : "",
          disabled,
        },
      );
    const rotate = (by: (rotation: number) => number) =>
      this.changeBox(app, (current) => ({
        rotation: by(current.rotation) % 360,
      }));
    return {
      label: this.t("paintCanvas.toolSettings.settings", {
        tool: this.t("paintCanvas.tool.move"),
      }),
      end: this.clipboardActions(app),
      start: html`${side("width", this.t("paintCanvas.common.width"))}
        <label
          class="icon-toggle"
          title=${this.t("paintCanvas.toolSettings.constrainProportions")}
        >
          <input
            type="checkbox"
            class="constrain"
            .checked=${live(app.constrainProportions)}
            @change=${(e: Event) =>
              app.setConstrainProportions(
                (e.target as HTMLInputElement).checked,
              )}
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
        ${this.renderNumberField(
          "angle",
          this.t("paintCanvas.toolSettings.angle"),
          box ? roundAngle(box.rotation) : 0,
          (value) => rotate(() => roundAngle(value)),
          {
            min: -360,
            max: 360,
            step: 0.01,
            dragStep: 1,
            unit: "°",
            text: disabled ? NO_VALUE : "",
            disabled,
          },
        )}
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
        </button>`,
    };
  }

  /** Render the zoom settings */
  private renderZoom(app: PaintCanvas): ToolView {
    const view = app.viewport;
    const centre = { x: view.width / 2, y: view.height / 2 };
    return {
      label: this.t("paintCanvas.toolSettings.settings", {
        tool: this.t("paintCanvas.tool.zoom"),
      }),
      end: [],
      start: html`<button
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
        </button>`,
    };
  }

  /** Render the colour sample tool's settings: point or area sampling */
  private renderColourSample(app: PaintCanvas): ToolView {
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
    return {
      label: this.t("paintCanvas.toolSettings.settings", {
        tool: this.t("paintCanvas.tool.colourSample"),
      }),
      end: [],
      start: html`${modes.map(
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
      )}`,
    };
  }

  /** The current tool's settings, if it has any */
  private toolView(app: PaintCanvas): ToolView | undefined {
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
        return MASK_TOOLS.includes(app.tool) ? this.renderMask(app) : undefined;
    }
  }

  override render() {
    const app = this.app;
    const view = app && this.toolView(app);
    if (!view) return nothing;
    return html`<div
        role="toolbar"
        aria-label=${view.label}
        @scroll=${this.placeSizeSettings}
      >
        <div class="start" part="start">
          ${view.start}<slot name="start"></slot>
        </div>
        <div class="end" part="end">
          ${this.renderEnd(view.end)}<slot name="end"></slot>
        </div>
      </div>
      ${view.after ?? nothing}`;
  }
}

defineElement("pc-tool-settings", PcToolSettings);
