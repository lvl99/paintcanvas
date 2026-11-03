import { css, html, nothing } from "lit";
import { PcElement, defineElement } from "../../base";

/**
 * A small ⓘ button that shows a short explanation (the element's content) beside it, and hides it again when pressed
 * again, when focus or a press goes elsewhere, or with Escape.
 *
 * @example
 * html`<pc-info-tip>Focus pen mode stops fingers and palms from drawing.</pc-info-tip>`
 */
export class PcInfoTip extends PcElement {
  static override properties = {
    ...PcElement.properties,
    label: { type: String },
    open: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        position: relative;
        display: inline-flex;
      }
      button {
        width: 20px;
        height: 20px;
        padding: 0;
        border: 1px solid var(--pc-border);
        border-radius: 50%;
        background: var(--pc-surface);
        color: var(--pc-text);
        font: bold 12px var(--pc-font);
        cursor: pointer;
      }
      button:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 2px;
      }
      [role="tooltip"] {
        position: absolute;
        z-index: 10;
        top: calc(100% + var(--pc-space-1));
        left: 0;
        width: max-content;
        max-width: 240px;
        padding: var(--pc-space-2);
        border-radius: var(--pc-radius);
        background: var(--pc-surface-raised);
        color: var(--pc-text);
        box-shadow: var(--pc-shadow);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size-small);
      }
    `,
  ];

  /** The button's name for screen readers (default "More information", translated) */
  declare label?: string;

  declare open: boolean;

  // Hide when pressing elsewhere
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.open && !event.composedPath().includes(this)) this.open = false;
  };

  constructor() {
    super();
    this.open = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this.onPointerDown, true);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("pointerdown", this.onPointerDown, true);
  }

  /** Escape hides the tip */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.open) {
      event.preventDefault();
      this.open = false;
    }
  }

  override render() {
    return html`<button
        part="button"
        type="button"
        aria-label=${this.label || this.t("paintCanvas.common.moreInformation")}
        aria-expanded=${String(this.open)}
        aria-describedby=${this.open ? "tip" : nothing}
        @click=${() => (this.open = !this.open)}
        @keydown=${this.onKeyDown}
        @blur=${() => (this.open = false)}
      >
        i
      </button>
      ${
        this.open
          ? html`<div id="tip" part="tip" role="tooltip"><slot></slot></div>`
          : nothing
      }`;
  }
}

defineElement("pc-info-tip", PcInfoTip);
