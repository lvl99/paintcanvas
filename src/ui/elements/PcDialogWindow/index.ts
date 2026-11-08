import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement } from "../../base";

/** Why the user asked to close a dialog window: its ⨉ button, the Escape key, or a press outside it */
export type DialogCloseReason = "close" | "escape" | "outside";

/** Event fired when the user asks to close a dialog window (detail: `{ reason }`); cancel it to keep the window open */
export const DIALOG_DISMISS_EVENT = "pc-dismiss";

/** Header and footer slots, from start to end */
const REGIONS = ["start", "middle", "end"] as const;

/** Reads a boolean attribute that's on unless it's `"false"` (for options that are on by default) */
const onUnlessFalse = {
  fromAttribute: (value: string | null) => value !== null && value !== "false",
  toAttribute: (value: boolean) => (value ? "" : "false"),
};

/** How many open modal windows are keeping the page from scrolling */
let scrollLocks = 0;

/** The page's own `overflow` while windows keep it from scrolling, to put back */
let pageOverflow = "";

/**
 * Keep the page from scrolling (or let it scroll again once every window that kept it from scrolling has closed).
 */
const lockPageScroll = (lock: boolean): void => {
  const root = document.documentElement;
  if (lock && scrollLocks++ === 0) {
    pageOverflow = root.style.overflow;
    root.style.overflow = "hidden";
  } else if (!lock && --scrollLocks === 0) root.style.overflow = pageOverflow;
};

/**
 * Whether a named slot has content (only elements can go in named slots).
 */
const hasContent = (slot: HTMLSlotElement): boolean =>
  slot.assignedElements({ flatten: true }).length > 0;

/**
 * A window over the page, built on the browser's `<dialog>`: centred in the viewport, never bigger than it, with a
 * header, a body and a footer. While it's `open`, the rest of the page can't be used or scrolled and keyboard focus stays
 * in it (moving to its first control, and back to where it was once it closes).
 *
 * Content goes in its slots: `header-start`, `header-middle` (which names the window for screen readers, unless it has a
 * `label`; `description` describes it), `header-end`, `body` (or no slot), `footer-start`, `footer-middle` and `footer-end`. The body scrolls when
 * there's too much to fit, keeping the header and footer in view. The header and footer only show with content (or the
 * ⨉ button).
 *
 * Options:
 * - `closable` (on by default; `closable="false"` turns it off): a ⨉ button at the top right.
 * - `shaded`: shade the page under it.
 * - `dismissible` (on by default; `dismissible="false"` turns it off): a press outside it closes it.
 * - `inline`: cover only its nearest positioned ancestor instead of the whole page, which stays usable (and scrolls).
 *
 * The ⨉ button, a press outside it (while `dismissible`) and Escape (while `closable` or `dismissible`) fire a cancellable
 * `pc-dismiss` event (detail: `{ reason }`, one of `close`, `outside` or `escape`); unless it's cancelled, the window
 * closes (`open` becomes false). `--pc-dialog-width` sets its width (fitted to its content by default).
 *
 * @example
 * html`<pc-dialog-window open shaded label="Keyboard shortcuts" @pc-dismiss=${close}>
 *   <h2 slot="header-middle">Keyboard shortcuts</h2>
 *   <pc-shortcut-settings slot="body" .settings=${settings}></pc-shortcut-settings>
 *   <pc-button slot="footer-end" @click=${close}>Done</pc-button>
 * </pc-dialog-window>`
 */
export class PcDialogWindow extends PcElement {
  static override properties = {
    ...PcElement.properties,
    open: { type: Boolean, reflect: true },
    closable: { converter: onUnlessFalse, reflect: true },
    shaded: { type: Boolean, reflect: true },
    dismissible: { converter: onUnlessFalse, reflect: true },
    inline: { type: Boolean, reflect: true },
    label: { type: String },
    description: { type: String },
    filled: { state: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: contents;
        --pc-dialog-gutter: var(--pc-space-3);
      }
      /* Inline: over the nearest positioned ancestor, while open */
      :host([inline]) {
        position: absolute;
        z-index: 20;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: var(--pc-dialog-gutter);
      }
      :host([inline]:not([open])) {
        display: none;
      }
      :host([inline][shaded]) {
        background: var(--pc-backdrop);
      }
      dialog {
        max-width: none;
        max-height: none;
        margin: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--pc-text);
        overflow: visible;
      }
      dialog[open] {
        display: flex;
      }
      :host([inline]) dialog {
        position: static;
        max-height: 100%;
        margin: 0;
      }
      dialog::backdrop {
        background: transparent;
      }
      :host([shaded]) dialog::backdrop {
        background: var(--pc-backdrop);
      }
      .window {
        display: flex;
        box-sizing: border-box;
        flex-direction: column;
        gap: var(--pc-space-2);
        width: var(--pc-dialog-width, auto);
        max-width: calc(100vw - 2 * var(--pc-dialog-gutter));
        /* The visible viewport's height where browsers have it, so phones' toolbars don't cover the footer */
        max-height: calc(100vh - 2 * var(--pc-dialog-gutter));
        max-height: calc(100dvh - 2 * var(--pc-dialog-gutter));
        padding: var(--pc-space-3);
        border-radius: var(--pc-radius);
        background: var(--pc-surface-raised);
        color: var(--pc-text);
        box-shadow: var(--pc-shadow);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      :host([inline]) .window {
        max-height: 100%;
      }
      header,
      footer {
        display: flex;
        flex: none;
        align-items: center;
        gap: var(--pc-space-2);
      }
      [hidden] {
        display: none !important;
      }
      .start,
      .end {
        display: flex;
        flex: none;
        align-items: center;
        gap: var(--pc-space-2);
      }
      .middle {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--pc-space-2);
        min-width: 0;
      }
      .end {
        margin-left: auto;
      }
      /* Scrolls when there's too much to fit; the padding keeps focus outlines in view */
      .body {
        flex: 1 1 auto;
        min-height: 0;
        margin: calc(-1 * var(--pc-space-1));
        padding: var(--pc-space-1);
        overflow: auto;
        overscroll-behavior: contain;
      }
      button.close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--pc-control-size);
        height: var(--pc-control-size);
        padding: 0;
        border: 0;
        border-radius: var(--pc-radius-pill);
        background: transparent;
        color: var(--pc-text);
        font: inherit;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
      }
      button.close:hover {
        background: var(--pc-surface-hover);
      }
      button.close:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
      }
    `,
  ];

  /** Whether it's shown */
  declare open: boolean;

  /** Whether it has a ⨉ button at the top right */
  declare closable: boolean;

  /** Whether the page under it is shaded */
  declare shaded: boolean;

  /** Whether a press outside it closes it */
  declare dismissible: boolean;

  /** Whether it covers only its nearest positioned ancestor, leaving the rest of the page usable */
  declare inline: boolean;

  /** Its name for screen readers, instead of its `header-middle` content */
  declare label?: string;

  /** A description for screen readers, e.g. the question a prompt asks */
  declare description?: string;

  /** The names of its header and footer slots that have content */
  declare filled: ReadonlySet<string>;

  /** Whether it's keeping the page from scrolling */
  private scrollLocked = false;

  /** Whether the `<dialog>` was last shown inline (not modal) */
  private shownInline = false;

  /** Whether the press being made started outside the window */
  private pressedOutside = false;

  constructor() {
    super();
    this.open = false;
    this.closable = true;
    this.shaded = false;
    this.dismissible = true;
    this.inline = false;
    this.filled = new Set();
  }

  /** The `<dialog>` it's built on */
  private get dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector("dialog");
  }

  /**
   * Ask to close the window, as the user would: fires `pc-dismiss` (detail: `{ reason }`), and closes it unless that's
   * cancelled.
   *
   * @example
   * dialogWindow.requestClose("close");
   */
  requestClose(reason: DialogCloseReason): void {
    const event = new CustomEvent(DIALOG_DISMISS_EVENT, {
      detail: { reason },
      cancelable: true,
    });
    if (this.dispatchEvent(event)) this.open = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Put back in the page while open (e.g. moved): show it again, as taking it out of the page took it out of the top layer
    if (!this.hasUpdated) return;
    const dialog = this.dialog as HTMLDialogElement;
    if (dialog.open) dialog.close();
    this.syncOpen();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.syncScrollLock();
  }

  protected override firstUpdated(changed: PropertyValues<this>): void {
    super.firstUpdated(changed);
    this.updateRegions();
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (changed.has("open") || changed.has("inline")) this.syncOpen();
  }

  /**
   * Show or close the `<dialog>` to match `open` (modal unless `inline`), keeping the page from scrolling while a modal
   * window is open.
   */
  private syncOpen(): void {
    const dialog = this.dialog as HTMLDialogElement;
    // Closed to be shown again the other way when `inline` changes
    if (dialog.open && (!this.open || this.shownInline !== this.inline))
      dialog.close();
    if (this.open && !dialog.open && this.isConnected) {
      this.shownInline = this.inline;
      if (this.inline) dialog.show();
      else dialog.showModal();
    }
    this.syncScrollLock();
  }

  /** Keep the page from scrolling while a modal window is open in it, and let it scroll again otherwise */
  private syncScrollLock(): void {
    const lock = this.open && !this.inline && this.isConnected;
    if (lock === this.scrollLocked) return;
    this.scrollLocked = lock;
    lockPageScroll(lock);
  }

  /** Note which header and footer slots have content: only those (and the header and footer with them) are shown */
  private updateRegions(): void {
    this.filled = new Set(
      [...this.renderRoot.querySelectorAll<HTMLSlotElement>("slot[name]")]
        .filter(hasContent)
        .map((slot) => slot.name),
    );
  }

  /** Whether any of a header's or footer's slots have content */
  private hasRegion(region: "header" | "footer"): boolean {
    return REGIONS.some((place) => this.filled.has(`${region}-${place}`));
  }

  // Escape asks to close (and stops the browser closing it by itself)
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (this.closable || this.dismissible) this.requestClose("escape");
  };

  // The browser's own request to close (e.g. Android's back gesture), handled as Escape
  private readonly onCancel = (event: Event) => {
    event.preventDefault();
    if (this.closable || this.dismissible) this.requestClose("escape");
  };

  // Closed some other way (e.g. a form with `method="dialog"`)
  private readonly onClose = () => {
    if (this.open && !this.dialog?.open) this.open = false;
  };

  // A press on the `<dialog>` itself (not the window in it) is outside the window: on the backdrop
  private readonly onPointerDown = (event: PointerEvent) => {
    this.pressedOutside = event.target === event.currentTarget;
  };

  // A press that started and ended outside the window closes it, while dismissible
  private readonly onClick = (event: MouseEvent) => {
    const outside = this.pressedOutside && event.target === event.currentTarget;
    this.pressedOutside = false;
    if (outside && this.dismissible) this.requestClose("outside");
  };

  /** A header or footer's start, middle and end slots */
  private renderRegion(region: "header" | "footer", end: unknown = nothing) {
    return REGIONS.map(
      (place) =>
        html`<div
          class=${place}
          part="${region}-${place}"
          ?hidden=${!this.filled.has(`${region}-${place}`) && (place !== "end" || end === nothing)}
          id=${region === "header" && place === "middle" ? "title" : nothing}
        >
          <slot
            name="${region}-${place}"
            @slotchange=${this.updateRegions}
          ></slot>
          ${place === "end" ? end : nothing}
        </div>`,
    );
  }

  override render() {
    const closeButton = this.closable
      ? html`<button
          type="button"
          class="close"
          part="close"
          aria-label=${this.t("paintCanvas.common.close")}
          title=${this.t("paintCanvas.common.close")}
          @click=${() => this.requestClose("close")}
        >
          ⨉
        </button>`
      : nothing;
    return html`<dialog
      part="dialog"
      aria-label=${this.label || nothing}
      aria-labelledby=${this.label ? nothing : "title"}
      aria-description=${this.description || nothing}
      @keydown=${this.onKeyDown}
      @cancel=${this.onCancel}
      @close=${this.onClose}
      @pointerdown=${this.onPointerDown}
      @click=${this.onClick}
    >
      <div class="window" part="window">
        <header
          part="header"
          ?hidden=${!this.hasRegion("header") && !this.closable}
        >
          ${this.renderRegion("header", closeButton)}
        </header>
        <div class="body" part="body">
          <slot name="body"></slot>
          <slot></slot>
        </div>
        <footer part="footer" ?hidden=${!this.hasRegion("footer")}>
          ${this.renderRegion("footer")}
        </footer>
      </div>
    </dialog>`;
  }
}

defineElement("pc-dialog-window", PcDialogWindow);
