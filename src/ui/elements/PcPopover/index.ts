import { css, html, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import { markDismissingPress } from "../../dismiss";

/** Height of a popover's arrow (pixels) */
export const POPOVER_ARROW_SIZE = 8;

/** Space kept between a placed popover and the window's edges (pixels) */
export const POPOVER_MARGIN = 8;

/**
 * Where a popover goes under its anchor: centred below it (leaving room for the arrow), moved sideways as far as needed
 * to stay in the window, with its arrow still pointing at the anchor's centre (`arrowX`, from the popover's left).
 *
 * @example
 * popoverBelow({ left: 100, bottom: 40, width: 40 }, 200, 1000); // { left: 20, top: 48, arrowX: 100 }
 * popoverBelow({ left: 0, bottom: 40, width: 40 }, 200, 1000); // { left: 8, top: 48, arrowX: 12 }
 */
export const popoverBelow = (
  anchor: { left: number; bottom: number; width: number },
  popoverWidth: number,
  viewportWidth: number,
  margin = POPOVER_MARGIN,
): { left: number; top: number; arrowX: number } => {
  const centre = anchor.left + anchor.width / 2;
  const left = Math.max(
    margin,
    Math.min(centre - popoverWidth / 2, viewportWidth - margin - popoverWidth),
  );
  return {
    left,
    top: anchor.bottom + POPOVER_ARROW_SIZE,
    arrowX: centre - left,
  };
};

/**
 * A floating box for a menu or settings (e.g. the brush presets), shown while `open`. The implementer places it (e.g.
 * next to the button that opens it), or `placeBelow` puts it under its `anchor`. With `arrow`, an arrow on its top edge
 * points up at the anchor (at `--pc-popover-arrow-x` from its left, the middle by default). It isn't modal: Escape, or a press outside it and outside its `anchor`, fires
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
    arrow: { type: Boolean, reflect: true },
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
      :host([arrow])::before {
        content: "";
        position: absolute;
        top: -${POPOVER_ARROW_SIZE}px;
        left: var(--pc-popover-arrow-x, 50%);
        border: ${POPOVER_ARROW_SIZE}px solid transparent;
        border-top: 0;
        border-bottom-color: var(--pc-surface-raised);
        transform: translateX(-50%);
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

  /** Whether an arrow on its top edge points up at the anchor */
  declare arrow: boolean;

  // Close when pressing outside the popover and its anchor
  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.open) return;
    const path = event.composedPath();
    if (path.includes(this) || (this.anchor && path.includes(this.anchor)))
      return;
    markDismissingPress(event);
    emit(this, "pc-close");
  };

  constructor() {
    super();
    this.open = false;
    this.label = "";
    this.arrow = false;
  }

  /**
   * Put the popover under its anchor, in the window (see `popoverBelow`), with its arrow pointing at the anchor. Call it
   * once open, so it can be measured.
   *
   * @example
   * popover.open = true;
   * await popover.updateComplete;
   * popover.placeBelow();
   */
  placeBelow(): void {
    if (!this.anchor) return;
    const { left, top, arrowX } = popoverBelow(
      this.anchor.getBoundingClientRect(),
      this.offsetWidth,
      window.innerWidth,
    );
    Object.assign(this.style, {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
    });
    this.style.setProperty("--pc-popover-arrow-x", `${arrowX}px`);
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
