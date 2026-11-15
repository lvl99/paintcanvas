import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement } from "../../base";

/**
 * A small ⓘ button that shows a short explanation (the element's content) beside it, and hides it again when pressed
 * again, when focus or a press goes elsewhere, or with Escape. The tip moves left as far as it needs to stay inside what
 * clips or scrolls around it (e.g. a window's body), and the page.
 *
 * @example
 * html`<pc-info-tip>Focus pen mode stops fingers and palms from drawing.</pc-info-tip>`
 */
/** Room kept between a tip and the edge it would go past, in pixels */
const TIP_MARGIN = 8;

/**
 * The right edge of the nearest ancestor as shown (through slots and shadow roots) that clips or scrolls its content
 * sideways, or Infinity if there's none.
 */
export const clippingRight = (element: Element): number => {
  /** The next node up as shown: the slot it's shown in, or its parent (or a shadow root's host) */
  const up = (node: Node): Node | null =>
    (node instanceof Element && node.assignedSlot) ||
    (node instanceof ShadowRoot ? node.host : node.parentNode);
  for (let node = up(element); node; node = up(node)) {
    if (
      node instanceof Element &&
      /auto|scroll|hidden|clip/.test(getComputedStyle(node).overflowX)
    )
      return node.getBoundingClientRect().right;
  }
  return Infinity;
};

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

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (changed.has("open") && this.open) this.keepInside();
  }

  /**
   * Move the shown tip left as far as it needs to stay inside what clips or scrolls around it (e.g. a window's body),
   * or the page, so it doesn't make it scroll sideways.
   */
  private keepInside(): void {
    // Shown while open
    const tip = this.renderRoot.querySelector("[role=tooltip]") as HTMLElement;
    tip.style.left = "";
    const right = Math.min(
      clippingRight(this),
      document.documentElement.clientWidth,
    );
    const overflow = tip.getBoundingClientRect().right - (right - TIP_MARGIN);
    if (overflow > 0) tip.style.left = `${-overflow}px`;
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
