import { css, html, nothing } from "lit";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import { live } from "lit/directives/live.js";
import "../PcNumberSlider";
import {
  BRUSH_SIZE_STEP,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  type default as BrushSettings,
} from "../../../lib/classes/BrushSettings";

/**
 * A brush's size as text: one number when the width and height are the same, otherwise "width × height".
 *
 * @example
 * sizeText({ width: 20, height: 20 }); // "20"
 * sizeText({ width: 30, height: 10 }); // "30 × 10"
 */
export const sizeText = ({
  width,
  height,
}: {
  width: number;
  height: number;
}): string => (width === height ? String(width) : `${width} × ${height}`);

/**
 * A brush or eraser's size, as a `pc-number-slider`: pressed and dragged right or up it gets bigger, left or down
 * smaller, keeping its proportions (see `BrushSettings.resize`). Tapping it lets you type the larger side's size. With
 * keyboard focus, the arrow keys change it by a pixel and Page Up and Page Down by a step (like `]` and `[`).
 *
 * @example
 * html`<pc-brush-size .settings=${app.brush} label="Brush size"></pc-brush-size>`
 */
export class PcBrushSize extends PcElement {
  static override properties = {
    ...PcElement.properties,
    settings: { attribute: false },
    label: { type: String },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: inline-flex;
      }
      pc-number-slider {
        flex: 1;
      }
    `,
  ];

  /** The brush or eraser settings it shows and changes */
  declare settings?: BrushSettings;

  /** Its name for screen readers, e.g. "Brush size" */
  declare label: string;

  private changes = new ChangeController(this, () => [this.settings]);

  constructor() {
    super();
    this.label = "";
  }

  /** Resize to the slider's value (the larger side), keeping the proportions */
  private onChange(event: CustomEvent<{ value: number }>): void {
    const settings = this.settings as BrushSettings;
    settings.resize(event.detail.value - settings.largerSide);
    // Show the size it got, which can differ (e.g. the smaller side can't go below 1 pixel)
    this.requestUpdate();
  }

  override render() {
    const settings = this.settings;
    if (!settings) return nothing;
    const larger = settings.largerSide;
    return html`<pc-number-slider
      exportparts="control, field"
      min=${MIN_BRUSH_SIZE}
      max=${MAX_BRUSH_SIZE}
      page-step=${Math.max(1, Math.round(larger * BRUSH_SIZE_STEP))}
      label=${this.label}
      .value=${live(larger)}
      .text=${sizeText(settings)}
      @pc-change=${this.onChange}
    ></pc-number-slider>`;
  }
}

defineElement("pc-brush-size", PcBrushSize);
