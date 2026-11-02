import { css, html, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";

/**
 * A floating box for a menu or settings (e.g. the brush presets), shown while `open`. The implementer places it (e.g.
 * next to the button that opens it). It isn't modal: Escape, or a press outside it and outside its `anchor`, fires
 * `pc-close`, and the implementer sets `open` to false in response. Focus moves into it when it opens.
 *
 * @example
 * html`<pc-popover ?open=${shown} label="Brush presets" .anchor=${button} @pc-close=${hide}>…</pc-popover>`
 */
export class PcPopover extends PcElement {
  static override properties = {
    ...PcElement.properties,
    open: { type: Boolean, reflect: true },
    label: { type: String },
    anchor: { attribute: false },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        position: absolute;
        z-index: 10;
        display: none;
      }
      :host([open]) {
        display: block;
      }
      [role="dialog"] {
        max-height: inherit;
        overflow: auto;
        padding: var(--pc-space-2);
        border-radius: var(--pc-radius);
        background: var(--pc-surface-raised);
        color: var(--pc-text);
        box-shadow: var(--pc-shadow);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      [role="dialog"]:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
      }
    `,
  ];

  declare open: boolean;

  /** Names the popover for screen readers */
  declare label: string;

  /** The element that opens it (pressing it doesn't count as pressing outside) */
  declare anchor?: Element;

  // Close when pressing outside the popover and its anchor
  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.open) return;
    const path = event.composedPath();
    if (!path.includes(this) && !(this.anchor && path.includes(this.anchor)))
      emit(this, "pc-close");
  };

  constructor() {
    super();
    this.open = false;
    this.label = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this.onPointerDown, true);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("pointerdown", this.onPointerDown, true);
  }

  override updated(changed: PropertyValues<this>): void {
    if (changed.has("open") && this.open)
      this.renderRoot.querySelector<HTMLElement>("[role=dialog]")?.focus();
  }

  /** Escape closes */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    emit(this, "pc-close");
  }

  override render() {
    return html`<div
      part="popover"
      role="dialog"
      aria-label=${this.label}
      tabindex="-1"
      @keydown=${this.onKeyDown}
    >
      <slot></slot>
    </div>`;
  }
}

defineElement("pc-popover", PcPopover);
