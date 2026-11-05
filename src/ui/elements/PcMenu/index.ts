import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import { markDismissingPress } from "../../dismiss";
import {
  ariaKeyShortcut,
  shortcutLabel,
  type KeyCombo,
} from "../../../lib/utils/shortcuts";
import "../PcIcon";

/** Longest shortcut label shown on a menu item (characters); longer ones are left out */
export const MAX_SHORTCUT_LABEL_LENGTH = 3;

/** An item in a menu that can be chosen */
export interface MenuItem {
  /** Optional; items are the default kind of menu entry */
  type?: "item";
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
  /** Marks the current choice (e.g. the selected tool) with the `selected` class and a purple background */
  selected?: boolean;
}

/** A non-interactive label naming the items after it (up to the next label or divider), e.g. "Tools" */
export interface MenuLabel {
  type: "label";
  label: string;
}

/** A non-interactive line between items */
export interface MenuDivider {
  type: "divider";
}

/** Anything a menu can show: an item, a label or a divider */
export type MenuEntry = MenuItem | MenuLabel | MenuDivider;

/** A run of items, with the label before them if there is one */
interface MenuSection {
  label?: string;
  items: MenuItem[];
  /** Whether a divider comes before it */
  divided: boolean;
}

/**
 * Whether a menu entry is an item that can be chosen.
 *
 * @example
 * isMenuItem({ value: "grid", label: "Grid" }); // true
 * isMenuItem({ type: "divider" }); // false
 */
export const isMenuItem = (entry: MenuEntry): entry is MenuItem =>
  entry.type === undefined || entry.type === "item";

/**
 * Whether a menu item has something to show on its left: a checkmark or an icon.
 *
 * @example
 * hasStart({ value: "grid", label: "Grid", checked: false }); // true
 */
const hasStart = (item: MenuItem): boolean =>
  item.checked !== undefined || item.icon !== undefined;

/**
 * A menu item's classes: `danger` and `selected`, when it is.
 *
 * @example
 * itemClasses({ value: "brush", label: "Brush", selected: true }); // "selected"
 */
const itemClasses = (item: MenuItem): string =>
  [item.danger && "danger", item.selected && "selected"]
    .filter(Boolean)
    .join(" ");

/**
 * Split menu entries into sections: a label or divider starts a new one.
 *
 * @example
 * menuSections([{ type: "label", label: "Tools" }, { value: "brush", label: "Brush" }]);
 * // [{ label: "Tools", items: [{ value: "brush", label: "Brush" }], divided: false }]
 */
export const menuSections = (entries: readonly MenuEntry[]): MenuSection[] => {
  const sections: MenuSection[] = [{ items: [], divided: false }];
  for (const entry of entries) {
    const current = sections[sections.length - 1] as MenuSection;
    if (isMenuItem(entry)) current.items.push(entry);
    else if (entry.type === "divider")
      sections.push({ items: [], divided: true });
    // A label after a divider (or at the start) names the section the divider began
    else if (current.items.length === 0 && current.label === undefined)
      current.label = entry.label;
    else sections.push({ label: entry.label, items: [], divided: false });
  }
  return sections.filter(
    (section) =>
      section.divided || section.label !== undefined || section.items.length,
  );
};

/**
 * A list of menu items, e.g. a layer's actions (see `pc-context-menu` for a button that opens one). While `open`, it shows its items at `x`, `y` (in the page's viewport) and takes
 * keyboard focus: arrow keys, Home and End move between items, Enter or Space chooses one, and Escape or Tab closes it.
 * Items can show a checkmark (toggles) or an icon on their left, and their keyboard shortcut on their right; long
 * labels wrap. Non-interactive labels (`{ type: "label", label }`, small bold text naming the items after them) and
 * dividers (`{ type: "divider" }`) can go between items; keyboard focus skips them.
 * Fires `pc-select` with the chosen item's value, and `pc-close` when it should close (after choosing, Escape, Tab, or a
 * press outside it and its `anchor`). The implementer sets `open` to false in response.
 *
 * @example
 * html`<pc-menu open .x=${10} .y=${20} label="Layer actions" .items=${items}
 *   @pc-select=${(e) => act(e.detail.value)} @pc-close=${close}></pc-menu>`
 */
export class PcMenu extends PcElement {
  static override properties = {
    ...PcElement.properties,
    open: { type: Boolean, reflect: true },
    items: { attribute: false },
    label: { type: String },
    x: { type: Number },
    y: { type: Number },
    anchor: { attribute: false },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        position: fixed;
        z-index: 10;
        display: none;
        user-select: none;
        -webkit-user-select: none;
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
      /* The current choice, e.g. the selected tool, like other selected buttons */
      button.selected,
      button.selected:hover:not(:disabled),
      button.selected:focus-visible {
        background: var(--pc-accent);
        color: var(--pc-accent-text);
      }
      button.selected .end {
        color: inherit;
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
      [role="group"] {
        display: flex;
        flex-direction: column;
      }
      .heading {
        padding: var(--pc-space-2) var(--pc-space-3) var(--pc-space-1);
        color: var(--pc-text-muted);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size-small);
        font-weight: bold;
        cursor: default;
      }
      [role="separator"] {
        height: 1px;
        margin: var(--pc-space-1) 0;
        background: var(--pc-border);
      }
    `,
  ];

  declare open: boolean;

  /** Items, labels and dividers, in order */
  declare items: readonly MenuEntry[];

  /** Names the menu for screen readers */
  declare label: string;

  declare x: number;

  declare y: number;

  /** The element that opens it (e.g. a `pc-context-menu`'s button): pressing it doesn't count as pressing outside */
  declare anchor?: Element;

  // Close when pressing outside the menu and its anchor
  private readonly onPointerDown = (event: PointerEvent) => {
    const path = event.composedPath();
    if (
      !this.open ||
      path.includes(this) ||
      (this.anchor && path.includes(this.anchor))
    )
      return;
    markDismissingPress(event);
    this.close();
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

  /** An item's button */
  private renderItem(item: MenuItem, showStart: boolean) {
    return html`<button
      part="item"
      type="button"
      role=${item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked=${item.checked === undefined ? nothing : String(item.checked)}
      aria-keyshortcuts=${
        item.shortcut ? ariaKeyShortcut(item.shortcut) : nothing
      }
      class=${itemClasses(item) || nothing}
      aria-current=${item.selected ? "true" : nothing}
      ?disabled=${item.disabled}
      data-value=${item.value}
      @click=${() => this.choose(item)}
    >
      ${showStart ? this.renderStart(item) : nothing}<span class="label"
        >${item.label}</span
      >${this.renderEnd(item)}
    </button>`;
  }

  /** A section: its divider and label, if any, and its items (grouped under the label for screen readers) */
  private renderSection(
    section: MenuSection,
    index: number,
    showStart: boolean,
  ) {
    const items = section.items.map((item) => this.renderItem(item, showStart));
    const id = `menu-label-${index}`;
    return html`${
      section.divided
        ? html`<div part="divider" role="separator"></div>`
        : nothing
    }${
      section.label === undefined
        ? items
        : html`<div role="group" aria-labelledby=${id}>
            <div part="label" class="heading" id=${id} role="presentation">
              ${section.label}
            </div>
            ${items}
          </div>`
    }`;
  }

  override render() {
    // Every item keeps the left space when any has something there, so labels line up
    const showStart = this.items.some(
      (entry) => isMenuItem(entry) && hasStart(entry),
    );
    return html`<div
      part="menu"
      role="menu"
      aria-label=${this.label}
      @keydown=${this.onKeyDown}
    >
      ${menuSections(this.items).map((section, index) =>
        this.renderSection(section, index, showStart),
      )}
    </div>`;
  }
}

defineElement("pc-menu", PcMenu);
