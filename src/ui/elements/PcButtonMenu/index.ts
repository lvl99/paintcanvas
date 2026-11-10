import { css, html, unsafeCSS } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import { PILLS_CSS, type PillSize } from "../../styles";
import type { MenuItem } from "../PcMenu";
import "../PcContextMenu";

/** An action in a button menu: what `pc-select` gives, its label and whether it can be done now */
export type ButtonMenuItem = Pick<MenuItem, "value" | "label" | "disabled">;

/**
 * Whether the window is narrower than a width (CSS pixels). False without a width or `matchMedia`.
 *
 * @example
 * isNarrowerThan(900); // true in a 600px-wide window
 */
export const isNarrowerThan = (
  width: number | undefined,
  matchMedia:
    | ((query: string) => { matches: boolean })
    | undefined = typeof window.matchMedia === "function"
    ? (query) => window.matchMedia(query)
    : undefined,
): boolean =>
  width !== undefined &&
  width > 0 &&
  matchMedia !== undefined &&
  matchMedia(`(width < ${width}px)`).matches;

/**
 * A row of pill buttons for actions, which can become one ⋮ menu (`pc-context-menu`): while `menu` is set, or while the
 * window is narrower than `menu-below` (CSS pixels; only when set). Fires `pc-select` (detail: `{ value }`) when an
 * action is chosen either way.
 *
 * @example
 * html`<pc-button-menu label="More actions" menu-below="900" size="pill-s"
 *   .items=${[{ value: "cut", label: "Cut" }, { value: "paste", label: "Paste", disabled: true }]}
 *   @pc-select=${(e) => run(e.detail.value)}></pc-button-menu>`
 */
export class PcButtonMenu extends PcElement {
  static override properties = {
    ...PcElement.properties,
    items: { attribute: false },
    label: { type: String },
    size: { type: String },
    menu: { type: Boolean, reflect: true },
    menuBelow: { type: Number, attribute: "menu-below" },
    narrowWindow: { state: true },
  };

  static override styles = [
    PcElement.styles,
    unsafeCSS(PILLS_CSS),
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--pc-space-2);
      }
      :host([hidden]) {
        display: none;
      }
    `,
  ];

  /** The actions, in order */
  declare items: ButtonMenuItem[];

  /** What the ⋮ button is called (e.g. "More actions") */
  declare label: string;

  /** The buttons' pill size (`pill` by default) */
  declare size: PillSize;

  /** Whether the actions are always one ⋮ menu */
  declare menu: boolean;

  /** Window width (CSS pixels) below which the actions are one ⋮ menu; none by default */
  declare menuBelow?: number;

  /** Whether the window is narrower than `menuBelow` */
  declare narrowWindow: boolean;

  /** Follows the window's width while `menuBelow` is set */
  private query?: MediaQueryList;

  private readonly onQueryChange = (event: MediaQueryListEvent) => {
    this.narrowWindow = event.matches;
  };

  constructor() {
    super();
    this.items = [];
    this.label = "";
    this.size = "pill";
    this.menu = false;
    this.narrowWindow = false;
  }

  /** Whether the actions show as one ⋮ menu now */
  get showsMenu(): boolean {
    return this.menu || this.narrowWindow;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.watchWidth();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopWatchingWidth();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has("menuBelow") && this.isConnected) this.watchWidth();
  }

  /** Follow whether the window is narrower than `menuBelow` (when set and the browser can tell) */
  private watchWidth(): void {
    this.stopWatchingWidth();
    this.narrowWindow = isNarrowerThan(this.menuBelow);
    if (!this.menuBelow || typeof window.matchMedia !== "function") return;
    // Some browsers and test stubs give no events, so the width is only read once then
    this.query = window.matchMedia(`(width < ${this.menuBelow}px)`);
    this.query.addEventListener?.("change", this.onQueryChange);
  }

  /** Stop following the window's width */
  private stopWatchingWidth(): void {
    this.query?.removeEventListener?.("change", this.onQueryChange);
    this.query = undefined;
  }

  /** Tell listeners an action was chosen */
  private select(value: string): void {
    emit(this, "pc-select", { value });
  }

  override render() {
    if (this.showsMenu)
      return html`<pc-context-menu
        class="more"
        label=${this.label}
        .items=${this.items.map(({ value, label, disabled }): MenuItem => ({
          value,
          label,
          disabled,
        }))}
        @pc-select=${(event: CustomEvent<{ value: string }>) => {
          event.stopPropagation();
          this.select(event.detail.value);
        }}
      ></pc-context-menu>`;
    return this.items.map(
      ({ value, label, disabled }) =>
        html`<button
          type="button"
          class="${this.size} ${value}"
          data-value=${value}
          ?disabled=${disabled}
          @click=${() => this.select(value)}
        >
          ${label}
        </button>`,
    );
  }
}

defineElement("pc-button-menu", PcButtonMenu);
