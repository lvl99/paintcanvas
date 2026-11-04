import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import {
  ariaKeyShortcut,
  shortcutLabel,
  type KeyCombo,
} from "../../../lib/utils/shortcuts";
import "../PcIcon";

/** Longest shortcut label shown on a menu item (characters); longer ones are left out */
export const MAX_SHORTCUT_LABEL_LENGTH = 3;

/** An item in a context menu */
export interface MenuItem {
  /** What `pc-select` gives when it's chosen */
  value: string;
  label: string;
  disabled?: boolean;
  /** Shown in the cancelling colour, e.g. for deleting */
  danger?: boolean;
  /** Makes the item a toggle, showing a checkmark on its left while on */
  checked?: boolean;
  /** Name of an icon to show on its left (see `icons`), when it isn't a toggle */
  icon?: string;
  /** The action's keyboard shortcut, shown on its right as symbols (e.g. ⌘S) when 3 characters or fewer */
  shortcut?: KeyCombo;
}

/**
 * Whether a menu item has something to show on its left: a checkmark or an icon.
 *
 * @example
 * hasStart({ value: "grid", label: "Grid", checked: false }); // true
 */
const hasStart = (item: MenuItem): boolean =>
  item.checked !== undefined || item.icon !== undefined;

/**
 * A menu of actions, e.g. for a layer. While `open`, it shows its items at `x`, `y` (in the page's viewport) and takes
 * keyboard focus: arrow keys, Home and End move between items, Enter or Space chooses one, and Escape or Tab closes it.
 * Items can show a checkmark (toggles) or an icon on their left, and their keyboard shortcut on their right; long
 * labels wrap.
 * Fires `pc-select` with the chosen item's value, and `pc-close` when it should close (after choosing, Escape, Tab, or a
 * press outside it). The implementer sets `open` to false in response.
 *
 * @example
 * html`<pc-context-menu open .x=${10} .y=${20} label="Layer actions" .items=${items}
 *   @pc-select=${(e) => act(e.detail.value)} @pc-close=${close}></pc-context-menu>`
 */
export class PcContextMenu extends PcElement {
  static override properties = {
    ...PcElement.properties,
    open: { type: Boolean, reflect: true },
    items: { attribute: false },
    label: { type: String },
    x: { type: Number },
    y: { type: Number },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        position: fixed;
        z-index: 10;
        display: none;
      }
      :host([open]) {
        display: block;
      }
      [role="menu"] {
        display: flex;
        min-width: 160px;
        max-width: min(320px, calc(100vw - 2 * var(--pc-space-3)));
        flex-direction: column;
        padding: var(--pc-space-1) 0;
        border-radius: var(--pc-radius);
        background: var(--pc-surface-raised);
        box-shadow: var(--pc-shadow);
      }
      button {
        display: flex;
        align-items: baseline;
        gap: var(--pc-space-2);
        padding: var(--pc-space-2) var(--pc-space-3);
        border: 0;
        background: transparent;
        color: var(--pc-text);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
        text-align: start;
        cursor: pointer;
      }
      button:hover:not(:disabled),
      button:focus-visible {
        background: var(--pc-surface-hover);
        outline: none;
      }
      button:focus-visible {
        box-shadow: inset 0 0 0 var(--pc-focus-width) var(--pc-focus);
      }
      button.danger {
        color: var(--pc-dismiss-text);
      }
      .start {
        /* Icons as tall as the text, so items with icons are no taller */
        --pc-icon-size: 1.2em;
        display: inline-flex;
        width: var(--pc-icon-size);
        flex: none;
        align-self: center;
        justify-content: center;
      }
      .label {
        flex: 1;
        overflow-wrap: anywhere;
      }
      .end {
        flex: none;
        color: var(--pc-text-muted);
        white-space: nowrap;
      }
      button:disabled {
        color: var(--pc-text-muted);
        cursor: default;
      }
    `,
  ];

  declare open: boolean;

  declare items: readonly MenuItem[];

  /** Names the menu for screen readers */
  declare label: string;

  declare x: number;

  declare y: number;

  // Close when pressing outside the menu
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.open && !event.composedPath().includes(this)) this.close();
  };

  constructor() {
    super();
    this.open = false;
    this.items = [];
    this.label = "";
    this.x = 0;
    this.y = 0;
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
    this.style.left = `${this.x}px`;
    this.style.top = `${this.y}px`;
    if (changed.has("open") && this.open) this.buttons()[0]?.focus();
  }

  /** The enabled items' buttons */
  private buttons(): HTMLButtonElement[] {
    return [
      ...this.renderRoot.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((button) => !button.disabled);
  }

  /** Tell listeners the menu should close */
  close(): void {
    emit(this, "pc-close");
  }

  /** Choose an item, then close */
  private choose(item: MenuItem): void {
    emit(this, "pc-select", { value: item.value });
    this.close();
  }

  /** Move focus between items, or close */
  private onKeyDown(event: KeyboardEvent): void {
    const buttons = this.buttons();
    const index = buttons.indexOf(
      (this.renderRoot as ShadowRoot).activeElement as HTMLButtonElement,
    );
    const last = buttons.length - 1;
    const target = {
      ArrowDown: index >= last ? 0 : index + 1,
      ArrowUp: index <= 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      buttons[target]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      this.close();
    }
  }

  /** An item's left side: a checkmark while a toggle is on, its icon, or empty space */
  private renderStart(item: MenuItem) {
    const content =
      item.checked !== undefined
        ? item.checked
          ? "✔"
          : nothing
        : item.icon
          ? html`<pc-icon name=${item.icon}></pc-icon>`
          : nothing;
    return html`<span part="item-start" class="start" aria-hidden="true"
      >${content}</span
    >`;
  }

  /** An item's right side: its shortcut's label, if short enough */
  private renderEnd(item: MenuItem) {
    const label = item.shortcut && shortcutLabel(item.shortcut);
    return label && [...label].length <= MAX_SHORTCUT_LABEL_LENGTH
      ? html`<span part="item-end" class="end" aria-hidden="true"
          >${label}</span
        >`
      : nothing;
  }

  override render() {
    // Every item keeps the left space when any has something there, so labels line up
    const showStart = this.items.some(hasStart);
    return html`<div
      part="menu"
      role="menu"
      aria-label=${this.label}
      @keydown=${this.onKeyDown}
    >
      ${this.items.map(
        (item) =>
          html`<button
            part="item"
            type="button"
            role=${item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked=${
              item.checked === undefined ? nothing : String(item.checked)
            }
            aria-keyshortcuts=${
              item.shortcut ? ariaKeyShortcut(item.shortcut) : nothing
            }
            class=${item.danger ? "danger" : nothing}
            ?disabled=${item.disabled}
            data-value=${item.value}
            @click=${() => this.choose(item)}
          >
            ${showStart ? this.renderStart(item) : nothing}<span class="label"
              >${item.label}</span
            >${this.renderEnd(item)}
          </button>`,
      )}
    </div>`;
  }
}

defineElement("pc-context-menu", PcContextMenu);
