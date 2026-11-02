import { css, html } from "lit";
import { live } from "lit/directives/live.js";
import { PcElement, defineElement, emit } from "../../base";
import "../PcIcon";

/**
 * An on/off setting shown as its icon in a box, purple while on (the icon stays the same). Its `label` names it for screen
 * readers and as a tooltip. Fires `change` when the user turns it on or off.
 *
 * @example
 * html`<pc-icon-toggle icon="pressure" label="Pressure" .checked=${on} @change=${toggle}></pc-icon-toggle>`
 */
export class PcIconToggle extends PcElement {
  static override properties = {
    ...PcElement.properties,
    icon: { type: String },
    label: { type: String },
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: inline-flex;
      }
      label {
        position: relative;
        display: inline-flex;
        padding: 2px;
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface);
        cursor: pointer;
      }
      label:hover {
        background: var(--pc-surface-hover);
      }
      :host([checked]) label {
        border-color: var(--pc-accent);
        background: var(--pc-accent);
      }
      label:has(input:focus-visible) {
        outline: var(--pc-focus-width) solid var(--pc-focus);
      }
      :host([disabled]) label {
        opacity: 0.4;
        cursor: default;
      }
      input {
        position: absolute;
        inset: 0;
        margin: 0;
        opacity: 0;
        cursor: inherit;
      }
    `,
  ];

  declare icon: string;

  declare label: string;

  declare checked: boolean;

  declare disabled: boolean;

  constructor() {
    super();
    this.icon = "";
    this.label = "";
    this.checked = false;
    this.disabled = false;
  }

  /** Follow the user's change, and tell listeners */
  private onChange(event: Event): void {
    this.checked = (event.target as HTMLInputElement).checked;
    emit(this, "change", { checked: this.checked });
  }

  override render() {
    return html`<label part="toggle" title=${this.label}>
      <input
        type="checkbox"
        .checked=${live(this.checked)}
        ?disabled=${this.disabled}
        aria-label=${this.label}
        @change=${this.onChange}
      />
      <pc-icon name=${this.icon}></pc-icon>
    </label>`;
  }
}

defineElement("pc-icon-toggle", PcIconToggle);
