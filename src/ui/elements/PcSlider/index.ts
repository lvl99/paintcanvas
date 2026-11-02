import { css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { PcElement, defineElement, emit } from "../../base";

/**
 * A slider with its label and value, e.g. opacity or volume. Fires `input` while dragging and `change` once let go,
 * each with the new `value`.
 *
 * @example
 * html`<pc-slider label="Opacity" min="0" max="100" unit="%" .value=${50} @change=${setOpacity}></pc-slider>`
 */
export class PcSlider extends PcElement {
  static override properties = {
    ...PcElement.properties,
    label: { type: String },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
    value: { type: Number },
    unit: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: block;
      }
      label {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--pc-space-1) var(--pc-space-2);
        align-items: center;
        color: var(--pc-text);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      input {
        grid-column: 1 / -1;
        width: 100%;
        margin: 0;
        accent-color: var(--pc-accent);
      }
      input:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 2px;
      }
      output {
        color: var(--pc-text-muted);
        font-variant-numeric: tabular-nums;
      }
    `,
  ];

  declare label: string;

  declare min: number;

  declare max: number;

  declare step: number;

  declare value: number;

  /** Shown after the value, e.g. "%" */
  declare unit: string;

  declare disabled: boolean;

  constructor() {
    super();
    this.label = "";
    this.min = 0;
    this.max = 100;
    this.step = 1;
    this.value = 0;
    this.unit = "";
    this.disabled = false;
  }

  /** Follow the slider, and tell listeners (`input` while dragging, `change` once let go) */
  private onSlide(event: Event): void {
    this.value = Number((event.target as HTMLInputElement).value);
    emit(this, event.type, { value: this.value });
  }

  override render() {
    return html`<label part="label">
      <span>${this.label}</span>
      <output part="value">${this.value}${this.unit || nothing}</output>
      <input
        part="slider"
        type="range"
        min=${this.min}
        max=${this.max}
        step=${this.step}
        .value=${live(String(this.value))}
        ?disabled=${this.disabled}
        @input=${this.onSlide}
        @change=${this.onSlide}
      />
    </label>`;
  }
}

defineElement("pc-slider", PcSlider);
