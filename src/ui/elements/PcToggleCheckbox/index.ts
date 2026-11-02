import { css, html } from "lit";
import { live } from "lit/directives/live.js";
import { PcElement, defineElement, emit } from "../../base";

/**
 * An on/off switch with its text (the element's content) beside it, e.g. for settings. Fires `change` when the user
 * turns it on or off.
 *
 * @example
 * html`<pc-toggle-checkbox .checked=${pinchZoom} @change=${toggle}>Pinch to zoom</pc-toggle-checkbox>`
 */
export class PcToggleCheckbox extends PcElement {
  static override properties = {
    ...PcElement.properties,
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: flex;
      }
      label {
        display: flex;
        flex: 1;
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
        width: 36px;
        height: 20px;
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
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        content: "";
        transition: transform 0.15s;
      }
      input:checked {
        background: var(--pc-accent);
      }
      input:checked::before {
        transform: translateX(16px);
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

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
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
