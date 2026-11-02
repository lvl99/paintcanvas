import { css, html, nothing } from "lit";
import { PcElement, defineElement } from "../../base";
import "../PcIcon";

/** How a button looks */
export type ButtonVariant = "accent" | "cancel" | "dismiss" | "pill" | "icon";

/**
 * A button: affirmative (`accent`, the default), cancelling (`cancel`), a quiet text button (`dismiss`), a small pill
 * (`pill`), or a boxed icon button (`icon`, which needs a `label` for screen readers). Its text goes in its content.
 * Clicks reach listeners on the element; a disabled button sends none.
 *
 * @example
 * html`<pc-button variant="cancel" @click=${close}>Cancel</pc-button>`
 * html`<pc-button variant="icon" icon="undo" label="Undo"></pc-button>`
 */
export class PcButton extends PcElement {
  static override properties = {
    ...PcElement.properties,
    variant: { type: String, reflect: true },
    icon: { type: String },
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
    pressed: { type: Boolean },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: inline-flex;
      }
      :host([disabled]) {
        pointer-events: none;
      }
      button {
        display: inline-flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        gap: var(--pc-space-1);
        min-height: var(--pc-control-size);
        padding: var(--pc-space-1) var(--pc-space-3);
        border: 0;
        border-radius: var(--pc-radius-pill);
        background: var(--pc-accent);
        color: var(--pc-accent-text);
        font: inherit;
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
        font-weight: bold;
        cursor: pointer;
      }
      button:hover:not(:disabled) {
        filter: brightness(1.15);
      }
      button:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 2px;
      }
      button:disabled {
        background: var(--pc-disabled);
        opacity: 0.6;
        cursor: default;
      }
      :host([variant="cancel"]) button {
        background: var(--pc-cancel);
        color: var(--pc-cancel-text);
      }
      :host([variant="dismiss"]) button {
        background: transparent;
        color: var(--pc-dismiss-text);
      }
      :host([variant="dismiss"]) button:hover {
        filter: none;
        text-decoration: underline;
      }
      :host([variant="pill"]) button {
        min-height: 30px;
      }
      :host([variant="icon"]) button {
        min-height: 0;
        padding: 2px;
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface);
        color: var(--pc-text);
      }
      :host([variant="icon"]) button:hover:not(:disabled) {
        filter: none;
        background: var(--pc-surface-hover);
      }
      :host([variant="icon"]) button[aria-pressed="true"] {
        background: var(--pc-accent);
      }
      :host([variant="icon"]) button:disabled {
        opacity: 0.4;
      }
    `,
  ];

  declare variant: ButtonVariant;

  /** Name of an icon to show before the text (or alone, for an icon button) */
  declare icon?: string;

  /** The button's name for screen readers, when its content doesn't say it (e.g. an icon button) */
  declare label?: string;

  declare disabled: boolean;

  /** For a button that toggles something: whether it's on (undefined for an ordinary button) */
  declare pressed?: boolean;

  constructor() {
    super();
    this.variant = "accent";
    this.disabled = false;
  }

  /** Move keyboard focus to the button */
  override focus(options?: FocusOptions): void {
    this.renderRoot.querySelector("button")?.focus(options);
  }

  override render() {
    return html`<button
      part="button"
      type="button"
      ?disabled=${this.disabled}
      aria-label=${this.label || nothing}
      aria-pressed=${this.pressed === undefined ? nothing : String(this.pressed)}
      title=${(this.variant === "icon" && this.label) || nothing}
    >
      ${this.icon ? html`<pc-icon name=${this.icon}></pc-icon>` : nothing}<slot
      ></slot>
    </button>`;
  }
}

defineElement("pc-button", PcButton);
