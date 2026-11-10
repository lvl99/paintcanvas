import { css, html } from "lit";
import { live } from "lit/directives/live.js";
import { PcElement, defineElement, emit } from "../../base";

/** Sizes of the switch: `m` (20px high, the default) and `s` (16px high, e.g. in toolbars) */
export const TOGGLE_SIZES = ["m", "s"] as const;

export type ToggleSize = (typeof TOGGLE_SIZES)[number];

/**
 * An on/off switch with its text (the element's content) beside it, e.g. for settings. Use it instead of plain
 * checkboxes. It comes in two sizes (`size`: `m`, 20px high, by default, or `s`, 16px high), both pressable over at
 * least 24px of height. Fires `change` when the user turns it on or off.
 *
 * @example
 * html`<pc-toggle-checkbox .checked=${pinchZoom} @change=${toggle}>Pinch to zoom</pc-toggle-checkbox>`
 * html`<pc-toggle-checkbox size="s">Show stroke points</pc-toggle-checkbox>`
 */
export class PcToggleCheckbox extends PcElement {
  static override properties = {
    ...PcElement.properties,
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    size: { type: String, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        --pc-toggle-height: 20px;
        --pc-toggle-width: 36px;
        display: flex;
      }
      :host([size="s"]) {
        --pc-toggle-height: 16px;
        --pc-toggle-width: 28px;
      }
      label {
        display: flex;
        flex: 1;
        /* The pressable area is at least 24px high, whatever the switch's size */
        min-height: 24px;
        gap: var(--pc-space-2);
        align-items: center;
        color: var(--pc-text);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
        cursor: pointer;
      }
      :host([disabled]) label {
        opacity: 0.5;
        cursor: default;
      }
      input {
        position: relative;
        flex: none;
        width: var(--pc-toggle-width);
        height: var(--pc-toggle-height);
        margin: 0;
        border-radius: var(--pc-radius-pill);
        background: var(--pc-disabled);
        appearance: none;
        cursor: inherit;
      }
      input::before {
        position: absolute;
        top: 2px;
        left: 2px;
        width: calc(var(--pc-toggle-height) - 4px);
        height: calc(var(--pc-toggle-height) - 4px);
        border-radius: 50%;
        background: #ffffff;
        content: "";
        transition: transform 0.15s;
      }
      input:checked {
        background: var(--pc-accent);
      }
      input:checked::before {
        transform: translateX(
          calc(var(--pc-toggle-width) - var(--pc-toggle-height))
        );
      }
      input:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        input::before {
          transition: none;
        }
      }
    `,
  ];

  declare checked: boolean;

  declare disabled: boolean;

  /** The switch's size: `m` (default) or `s` */
  declare size: ToggleSize;

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
    this.size = "m";
  }

  /** Follow the user's change, and tell listeners */
  private onChange(event: Event): void {
    this.checked = (event.target as HTMLInputElement).checked;
    emit(this, "change", { checked: this.checked });
  }

  override render() {
    return html`<label part="label">
      <input
        part="switch"
        type="checkbox"
        role="switch"
        .checked=${live(this.checked)}
        ?disabled=${this.disabled}
        @change=${this.onChange}
      />
      <span><slot></slot></span>
    </label>`;
  }
}

defineElement("pc-toggle-checkbox", PcToggleCheckbox);
