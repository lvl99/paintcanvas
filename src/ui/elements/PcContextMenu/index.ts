import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import { PcMenu, type MenuEntry } from "../PcMenu";
import "../PcMenu";

/** Space kept between a context menu's menu and the window's edges */
export const MENU_MARGIN = 8;

/** Event fired when a context menu opens or closes (detail: `{ open }`) */
export const CONTEXT_MENU_TOGGLE_EVENT = "pc-toggle";

/** Where a context menu's menu opens: under its button, or beside it */
export type MenuPlacement = "below" | "beside";

/**
 * Where a menu's top goes: level with its anchor, moved up as far as needed to stay in the window (but never above its
 * top margin).
 *
 * @example
 * menuTop(700, 300, 800); // 492 (moved up to fit)
 * menuTop(100, 300, 800); // 100
 */
export const menuTop = (
  anchorTop: number,
  menuHeight: number,
  viewportHeight: number,
  margin = MENU_MARGIN,
): number =>
  Math.max(margin, Math.min(anchorTop, viewportHeight - margin - menuHeight));

/**
 * Where a menu's left edge goes: at `left`, moved left as far as needed to stay in the window (but never past its left
 * margin).
 *
 * @example
 * menuLeft(900, 200, 1000); // 792 (moved left to fit)
 */
export const menuLeft = (
  left: number,
  menuWidth: number,
  viewportWidth: number,
  margin = MENU_MARGIN,
): number =>
  Math.max(margin, Math.min(left, viewportWidth - margin - menuWidth));

/**
 * A button that opens a menu (`pc-menu`): its `icon` slot is what the button shows (⋮ by default), and its `menu` slot
 * takes the `pc-menu` to open. Without one, it opens its own menu of `items`. Pressing the button (or right-clicking
 * it) opens the menu under it (or beside it, with `placement="beside"`), kept within the window; choosing an item,
 * pressing outside, Escape, Tab, scrolling or pressing the button again closes it, and focus returns to the button.
 *
 * Fires `pc-toggle` (detail: `{ open }`) when it opens or closes. The menu's `pc-select` (detail: `{ value }`) reaches
 * the context menu's listeners.
 *
 * @example
 * html`<pc-context-menu label="Layer actions" .items=${items} @pc-select=${(e) => act(e.detail.value)}>
 *   <pc-icon slot="icon" name="menu"></pc-icon>
 * </pc-context-menu>`
 */
export class PcContextMenu extends PcElement {
  static override properties = {
    ...PcElement.properties,
    open: { type: Boolean, reflect: true },
    items: { attribute: false },
    label: { type: String },
    menuLabel: { type: String, attribute: "menu-label" },
    placement: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: inline-flex;
      }
      button {
        display: inline-flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        min-width: var(--pc-control-size);
        min-height: var(--pc-control-size);
        padding: 0 var(--pc-space-1);
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface);
        color: var(--pc-text);
        font: inherit;
        cursor: pointer;
      }
      button:hover:not(:disabled),
      :host([open]) button {
        background: var(--pc-surface-hover);
      }
      button:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
      }
      button:disabled {
        opacity: 0.4;
        cursor: default;
      }
    `,
  ];

  /** Whether the menu is open */
  declare open: boolean;

  /** The items of its own menu, when no `pc-menu` is slotted */
  declare items: readonly MenuEntry[];

  /** Names the button for screen readers */
  declare label: string;

  /** Names the menu for screen readers (the button's `label` by default) */
  declare menuLabel: string;

  /** Where the menu opens: under the button (default) or beside it */
  declare placement: MenuPlacement;

  declare disabled: boolean;

  // The menu floats where it opened, so scrolling (e.g. a panel) closes it
  private readonly onScroll = () => this.setOpen(false);

  constructor() {
    super();
    this.open = false;
    this.items = [];
    this.label = "";
    this.menuLabel = "";
    this.placement = "below";
    this.disabled = false;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("scroll", this.onScroll, true);
  }

  /** The menu it opens: the slotted `pc-menu`, or its own */
  get menu(): PcMenu | undefined {
    const slot =
      this.renderRoot.querySelector<HTMLSlotElement>('slot[name="menu"]');
    return (
      slot
        ?.assignedElements({ flatten: true })
        .find((element): element is PcMenu => element instanceof PcMenu) ??
      undefined
    );
  }

  /** The button that opens the menu */
  private get button(): HTMLButtonElement {
    return this.renderRoot.querySelector("button") as HTMLButtonElement;
  }

  /**
   * Open or close the menu, telling listeners.
   */
  setOpen(open: boolean): void {
    if (open === this.open || (open && this.disabled)) return;
    this.open = open;
    emit(this, CONTEXT_MENU_TOGGLE_EVENT, { open });
  }

  /** Open the menu on a right-click (instead of the browser's), or close it */
  private onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.setOpen(!this.open);
  }

  /** Close the menu when it asks to, and return focus to the button */
  private onClose(): void {
    // Only a menu asks to close, so there is one
    const focusWasInside = (this.menu as PcMenu).matches(":focus-within");
    this.setOpen(false);
    if (focusWasInside) this.button.focus();
  }

  /** Set up a newly slotted menu like the current one (open or closed) */
  private onMenuSlotChange(): void {
    this.requestUpdate("open", !this.open);
  }

  protected override updated(changed: PropertyValues<this>): void {
    const menu = this.menu;
    if (!menu) return;
    menu.anchor = this;
    // A slotted menu without its own name is named like the button
    menu.label ||= this.menuLabel || this.label;
    if (!changed.has("open")) return;
    window[this.open ? "addEventListener" : "removeEventListener"](
      "scroll",
      this.onScroll,
      true,
    );
    menu.open = this.open;
    if (this.open) void this.place(menu);
  }

  /** Put the open menu under or beside the button, within the window */
  private async place(menu: PcMenu): Promise<void> {
    const anchor = this.button.getBoundingClientRect();
    const beside = this.placement === "beside";
    menu.x = beside ? anchor.right : anchor.left;
    menu.y = beside ? anchor.top : anchor.bottom;
    // Measured once shown
    await menu.updateComplete;
    menu.x = menuLeft(menu.x, menu.offsetWidth, window.innerWidth);
    menu.y = menuTop(menu.y, menu.offsetHeight, window.innerHeight);
  }

  override render() {
    return html`<button
        type="button"
        part="button"
        aria-haspopup="menu"
        aria-expanded=${String(this.open)}
        aria-label=${this.label || nothing}
        ?disabled=${this.disabled}
        @click=${() => this.setOpen(!this.open)}
        @contextmenu=${this.onContextMenu}
      >
        <slot name="icon">⋮</slot></button
      ><slot
        name="menu"
        @slotchange=${this.onMenuSlotChange}
        @pc-close=${this.onClose}
        >${
          this.items.length
            ? html`<pc-menu
                .items=${this.items}
                label=${this.menuLabel || this.label}
              ></pc-menu>`
            : nothing
        }</slot
      >`;
  }
}

defineElement("pc-context-menu", PcContextMenu);
