import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { PcElement, defineElement, emit } from "../../base";
import { markDismissingPress } from "../../dismiss";
import { PcPanel } from "../PcPanel";
import type { SideMode } from "../../layout";

/** Which way a pane's start, middle and end run */
export type PaneOrientation = "vertical" | "horizontal";

/** Which edge of the layout a pane is on: panels opened from its rail, and its floating box, go the other way */
export type PaneEdge = "left" | "right" | "top" | "bottom";

/** Event fired when a floating pane is shown or collapsed (detail: `{ collapsed }`) */
export const PANE_COLLAPSE_EVENT = "pc-collapse";

/** Elements that can take keyboard focus */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * An area where buttons and panels are shown or docked, e.g. a side of the `<paint-canvas>` layout. Its content goes in
 * its `start`, `middle` and `end` slots (content without a slot goes at the start), which run down a `vertical` pane
 * (the default) or across a `horizontal` one; the middle takes the space left.
 *
 * Its `mode` sets how it shows its panels (`PcPanel`s, e.g. `<pc-panel-layers>`):
 * - `docked`: as they are.
 * - `rail`: as a column of buttons (with each panel's icon, name and badge) that open one panel at a time over the
 *   canvas, beside the pane (away from its `edge`). Focus moves into the panel; Escape, a press outside it or its
 *   button again closes it, and focus goes back to the button.
 * - `floating`: the pane floats over the canvas as a box that collapses to a button (`collapsed`, named with its
 *   `label`), firing `pc-collapse` when it's shown or collapsed.
 *
 * Panes made for one purpose extend it and put their own content in its regions (see `renderStart`, `renderMiddle`
 * and `renderEnd`), e.g. `<pc-toolbar>`.
 *
 * @example
 * html`<pc-pane edge="right" mode="rail" label="Panels"><pc-panel-layers .app=${app}></pc-panel-layers></pc-pane>`
 */
export class PcPane extends PcElement {
  static override properties = {
    ...PcElement.properties,
    orientation: { type: String, reflect: true },
    mode: { type: String, reflect: true },
    edge: { type: String, reflect: true },
    label: { type: String },
    collapsed: { type: Boolean, reflect: true },
    openPanel: { state: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        position: relative;
        display: flex;
        box-sizing: border-box;
        min-width: 0;
        min-height: 0;
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      :host([edge="right"]) {
        flex-direction: row-reverse;
      }
      .regions {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      :host([orientation="horizontal"]) .regions {
        flex-direction: row;
      }
      .start,
      .middle,
      .end {
        display: flex;
        flex-direction: inherit;
      }
      /* The middle takes the space left, and gives it up first; the start and end keep their content's size */
      .middle {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }
      .regions[hidden] {
        display: none;
      }

      /* Rail: a column of buttons, one per panel, on the side facing the canvas */
      .rail {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-1);
        padding: var(--pc-space-1);
        border-inline: 1px solid var(--pc-border);
        background: var(--pc-bar);
      }
      .rail button {
        position: relative;
        display: inline-flex;
        padding: var(--pc-space-1);
        border: 1px solid transparent;
        border-radius: var(--pc-radius-small);
        background: transparent;
        cursor: pointer;
      }
      .rail button:hover {
        background: var(--pc-surface-hover);
      }
      .rail button[aria-expanded="true"] {
        border-color: var(--pc-accent);
        background: var(--pc-accent);
      }
      .rail button:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
      }
      .rail img {
        width: var(--pc-icon-size);
        height: var(--pc-icon-size);
        filter: var(--pc-icon-filter);
      }
      .rail .badge {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 10px;
        height: 10px;
        border: 2px solid var(--pc-bar);
        border-radius: 50%;
        background: var(--pc-red);
      }

      /* Floating: the pane floats over the canvas as a box, and collapses to a button */
      :host([mode="floating"]) {
        position: absolute;
        z-index: 5;
        top: var(--pc-space-2);
        bottom: var(--pc-space-2);
        flex-direction: column;
        gap: var(--pc-space-1);
        max-width: var(--pc-floating-panel-width, min(360px, 85vw));
        border-radius: var(--pc-radius);
        background: var(--pc-surface-raised);
        box-shadow: var(--pc-shadow);
        overflow: hidden;
      }
      :host([mode="floating"]:not([edge="right"])) {
        left: var(--pc-space-2);
      }
      :host([mode="floating"][edge="right"]) {
        right: var(--pc-space-2);
      }
      :host([mode="floating"][collapsed]) {
        bottom: auto;
      }
      .collapse {
        align-self: flex-end;
        min-width: var(--pc-control-size);
        min-height: var(--pc-control-size);
        border: 0;
        background: transparent;
        color: var(--pc-text);
        font-size: 18px;
        cursor: pointer;
      }
      .collapse:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
      }
    `,
  ];

  /** Which way its start, middle and end run (`vertical` by default) */
  declare orientation: PaneOrientation;

  /** How it shows its panels (`docked` by default) */
  declare mode: SideMode;

  /** Which edge of the layout it's on (`left` by default) */
  declare edge: PaneEdge;

  /** Names it, e.g. on its button when floating and collapsed */
  declare label: string;

  /** Whether it's collapsed to a button while floating (true until opened) */
  declare collapsed: boolean;

  /** The panel open from its rail, if any */
  declare openPanel?: PcPanel;

  /** The panels in it */
  private panels: PcPanel[] = [];

  /** The rail button that opened the open panel, to return focus to */
  private opener?: HTMLElement;

  // Rail buttons follow the panels' icons, names and badges
  private readonly panelObserver = new MutationObserver(() =>
    this.requestUpdate(),
  );

  // A press outside the open panel and its rail button closes it
  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    const panel = this.openPanel;
    if (!panel) return;
    const path = event.composedPath();
    if (path.includes(panel) || (this.opener && path.includes(this.opener)))
      return;
    markDismissingPress(event);
    this.closePanel(false);
  };

  // Escape closes the open panel
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.openPanel) return;
    event.preventDefault();
    this.closePanel(true);
  };

  constructor() {
    super();
    this.orientation = "vertical";
    this.mode = "docked";
    this.edge = "left";
    this.label = "";
    this.collapsed = true;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.panelObserver.observe(this, {
      subtree: true,
      attributes: true,
      attributeFilter: ["icon", "label", "badge"],
    });
    this.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.panelObserver.disconnect();
    this.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener(
      "pointerdown",
      this.onDocumentPointerDown,
      true,
    );
  }

  /**
   * Open a panel over the canvas from its rail button (closing any other), or close it if it's open. Focus moves into
   * the panel: to the first thing in it that takes focus, or the panel itself.
   *
   * @example
   * pane.togglePanel(pane.querySelector("pc-panel-layers"));
   */
  togglePanel(panel: PcPanel, opener?: HTMLElement): void {
    if (this.openPanel === panel) {
      this.closePanel(true);
      return;
    }
    if (this.openPanel) this.closePanel(false);
    this.openPanel = panel;
    this.opener = opener;
    this.syncPanels();
    const focusable = panel.querySelector<HTMLElement>(FOCUSABLE);
    if (focusable) focusable.focus();
    else {
      panel.tabIndex = -1;
      panel.focus();
    }
  }

  /**
   * Close the panel open from the rail, moving focus back to its rail button if asked.
   */
  closePanel(returnFocus: boolean): void {
    if (!this.openPanel) return;
    this.openPanel = undefined;
    this.syncPanels();
    if (returnFocus) this.opener?.focus();
    this.opener = undefined;
  }

  /** Show or collapse the floating pane, telling listeners */
  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    emit(this, PANE_COLLAPSE_EVENT, { collapsed: this.collapsed });
  }

  /** Follow the panels slotted into it */
  private onSlotChange(): void {
    this.panels = [
      ...this.renderRoot.querySelectorAll<HTMLSlotElement>("slot"),
    ].flatMap((slot) =>
      slot
        .assignedElements({ flatten: true })
        .filter((element): element is PcPanel => element instanceof PcPanel),
    );
    if (this.openPanel && !this.panels.includes(this.openPanel))
      this.closePanel(false);
    this.syncPanels();
    this.requestUpdate();
  }

  /** Show the panels for the mode: hidden behind the rail (except the open one, beside the pane) or as they are */
  private syncPanels(): void {
    const rail = this.mode === "rail";
    for (const panel of this.panels) {
      panel.toggleAttribute("data-pc-rail", rail);
      if (rail && panel === this.openPanel)
        panel.setAttribute("data-pc-open", this.edge);
      else panel.removeAttribute("data-pc-open");
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has("mode") && !changed.has("edge")) return;
    // A panel opened from the rail closes when the rail goes
    if (this.mode !== "rail") this.closePanel(false);
    this.syncPanels();
  }

  /** Content of its own at its start, before what's slotted there */
  protected renderStart(): TemplateResult | typeof nothing {
    return nothing;
  }

  /** Content of its own in its middle, before what's slotted there */
  protected renderMiddle(): TemplateResult | typeof nothing {
    return nothing;
  }

  /** Content of its own at its end, before what's slotted there */
  protected renderEnd(): TemplateResult | typeof nothing {
    return nothing;
  }

  /** The rail: a button per panel */
  private renderRail() {
    if (this.mode !== "rail" || this.panels.length === 0) return nothing;
    return html`<div
      class="rail"
      part="rail"
      role="toolbar"
      aria-orientation="vertical"
      aria-label=${this.label || nothing}
    >
      ${this.panels.map((panel) => {
        const label = panel.panelLabel;
        return html`<button
          type="button"
          title=${label}
          aria-label=${
            panel.badge
              ? this.t("paintCanvas.layout.new", { name: label })
              : label
          }
          aria-expanded=${String(this.openPanel === panel)}
          @click=${(event: Event) =>
            this.togglePanel(panel, event.currentTarget as HTMLElement)}
        >
          <img src=${this.iconUrl(panel.panelIcon)} alt="" />
          ${panel.badge ? html`<span class="badge"></span>` : nothing}
        </button>`;
      })}
    </div>`;
  }

  /** The button that shows or collapses a floating pane */
  private renderCollapse() {
    if (this.mode !== "floating") return nothing;
    const collapsed = this.collapsed;
    const arrows = this.edge === "right" ? ["«", "»"] : ["»", "«"];
    return html`<button
      type="button"
      class="collapse"
      part="collapse"
      aria-expanded=${String(!collapsed)}
      aria-label=${this.t(
        collapsed ? "paintCanvas.layout.show" : "paintCanvas.layout.hide",
        { name: this.label },
      )}
      @click=${this.toggleCollapsed}
    >
      ${collapsed ? arrows[0] : arrows[1]}
    </button>`;
  }

  override render() {
    return html`${this.renderCollapse()}
      <div
        class="regions"
        part="regions"
        ?hidden=${this.mode === "floating" && this.collapsed}
      >
        <div class="start" part="start">
          ${this.renderStart()}<slot
            name="start"
            @slotchange=${this.onSlotChange}
          ></slot
          ><slot @slotchange=${this.onSlotChange}></slot>
        </div>
        <div class="middle" part="middle">
          ${this.renderMiddle()}<slot
            name="middle"
            @slotchange=${this.onSlotChange}
          ></slot>
        </div>
        <div class="end" part="end">
          ${this.renderEnd()}<slot
            name="end"
            @slotchange=${this.onSlotChange}
          ></slot>
        </div>
      </div>
      ${this.renderRail()}`;
  }
}

defineElement("pc-pane", PcPane);
