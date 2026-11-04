import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { PcElement, defineElement, emit } from "../../base";
import ChangeController from "../../ChangeController";
import PaintCanvas, { Panel } from "../../../lib/classes/PaintCanvas";
import KeyboardShortcuts, {
  SHORTCUT_EVENT,
} from "../../../lib/classes/KeyboardShortcuts";
import { isTouchDevice } from "../../../lib/classes/InputSettings";
import type { Insets } from "../../../lib/classes/Viewport";
import type { ShortcutAction } from "../../../lib/utils/shortcuts";
import IndexedDbLayerStore, {
  IndexedDbSettingsStore,
} from "../../../lib/storage";
import SettingsAutosave, {
  SETTINGS_AUTOSAVE_ERROR_EVENT,
} from "../../../lib/classes/SettingsAutosave";
import LayerAutosave, {
  AUTOSAVE_ERROR_EVENT,
  AutosaveState,
} from "../../../lib/classes/LayerAutosave";
import type { BrushConfig } from "../../../lib/brushes/types";
import { isOwnAuthor } from "../../../lib/brushes/authors";
import {
  renderScreenshot,
  saveFile as saveFileToDisk,
  screenshotName,
  type SaveMethod,
} from "../../../lib/rendering/screenshot";
import {
  DEFAULT_NARROW_WIDTH,
  DEFAULT_SIDE_MODES,
  STATE_EVENT,
  parseSideModes,
  sideModeFor,
  type InputKind,
  type LayoutState,
  type SideMode,
} from "../../layout";
import { hasToolSettings } from "../PcToolSettings";
import type { PcPanel } from "../PcPanel";
import "../PcPanel";
import "../PcToolbar";
import "../PcToolSettings";
import "../PcCanvas";
import "../PcCanvasMap";
import "../PcBrushMenu";
import "../PcLayersMenu";
import "../PcBrushConfig";
import "../PcStats";
import "../PcDialog";
import type { DialogChoice } from "../PcDialog";

/** A side of the layout */
type Side = "left" | "right";

/** No space kept clear */
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The choice that takes the drawing over from another window */
const TAKE_OVER_CHOICE = "take-over";

/** Elements that can take keyboard focus */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A ready-made painting app: the drawing elements arranged around the canvas, sized to its container (not the
 * window), with slots to add or replace content:
 *
 * - `header`: across the top (empty by default)
 * - `left`: `<pc-toolbar>` by default
 * - `top`: `<pc-tool-settings>` (for tools that have settings) by default
 * - `right`: empty by default (e.g. a `<pc-panel>` with a layers menu or chat)
 * - `center`: `<pc-canvas>` by default
 * - `overlay`: drawn over the canvas; `<pc-canvas-map>` by default
 * - `bottom`: under the canvas (empty by default)
 * - `footer`: across the bottom; `<pc-stats>` by default
 * - `menu`: the app menu the toolbar's menu button opens (the button shows only with a menu)
 *
 * Content given for a slot replaces its default; an empty element clears it. Empty slots take no space. Hiding the
 * interface (Tab key) leaves only the canvas and overlay. A `<pc-layers-menu>` given in a side (e.g. in a `<pc-panel>`)
 * replaces the toolbar's layers menu button.
 *
 * Each side has a mode, chosen by the layout's width from `left-modes` and `right-modes` (default `"docked,
 * rail@600"`): `docked` beside the canvas; `rail`, a column of buttons (one per `<pc-panel>`) that open each panel over
 * the canvas; or `floating`, the side over the canvas as a palette that collapses to a button.
 *
 * Reports its state for styling as attributes (`narrow`, `input="pen|touch|mouse"`, `ui-hidden`, `left-mode`,
 * `right-mode`) and as `pc-state-change` events (see `LayoutState`). Creates its own canvas unless given one, and
 * handles keyboard shortcuts unless `shortcuts` is false.
 *
 * With a `store` name, the user's layers are kept in the browser (IndexedDB) under that name, so the drawing survives
 * reloading the page (see `LayerAutosave`). While another window is drawing on it, the layout is blocked by a message
 * that offers to draw here instead. Fires `pc-toast` when the drawing can't be loaded or saved.
 *
 * With a `settings-store` name, the user's app settings (input settings, keyboard shortcuts, colour palette and
 * colours) are kept in the browser under that name (see `SettingsAutosave`). Fires `pc-toast` when they can't be.
 *
 * @example
 * html`<paint-canvas style="height: 600px"></paint-canvas>`
 * html`<paint-canvas .app=${canvas} right-modes="docked, rail@800">
 *   <pc-panel slot="right" icon="layers" label="Layers"><pc-layers-menu .app=${canvas}></pc-layers-menu></pc-panel>
 * </paint-canvas>`
 */
export class PaintCanvasElement extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    leftModes: { type: String, attribute: "left-modes" },
    rightModes: { type: String, attribute: "right-modes" },
    narrowWidth: { type: Number, attribute: "narrow-width" },
    menuText: { type: String, attribute: "menu-text" },
    menuLabel: { type: String, attribute: "menu-label" },
    shortcuts: { type: Boolean },
    store: { type: String },
    settingsStore: { type: String, attribute: "settings-store" },
    width: { state: true },
    input: { state: true },
    configuring: { state: true },
    collapsed: { state: true },
    openPanel: { state: true },
  };

  static override styles = [PcElement.styles, unsafeCSS(styles)];

  /** The canvas (one is created if none is given) */
  declare app?: PaintCanvas;

  /** The left side's modes (see `parseSideModes`) */
  declare leftModes: string;

  /** The right side's modes (see `parseSideModes`) */
  declare rightModes: string;

  /** Width (CSS pixels) below which the layout is narrow */
  declare narrowWidth: number;

  /** What the toolbar's menu button shows */
  declare menuText: string;

  /** The toolbar's menu button's name for screen readers */
  declare menuLabel?: string;

  /** Whether the layout handles keyboard shortcuts (default true) */
  declare shortcuts: boolean;

  /** Name to keep the user's layers under in the browser, so the drawing survives reloading the page (none by default) */
  declare store?: string;

  /** Name to keep the user's app settings under in the browser (none by default) */
  declare settingsStore?: string;

  /** The layout's width in CSS pixels */
  declare width: number;

  /** The input being used now */
  declare input: InputKind;

  /** The brush or eraser configuration window, while open */
  declare configuring?: {
    kind: "brush" | "eraser";
    config: BrushConfig;
    editingId?: string;
  };

  /** Which floating sides are collapsed to a button */
  declare collapsed: Record<Side, boolean>;

  /** The panel open from a rail, if any */
  declare openPanel?: PcPanel;

  /** Saves files (replaceable for tests) */
  saveFile: (blob: Blob, name: string) => Promise<SaveMethod | undefined> =
    saveFileToDisk;

  private changes = new ChangeController(this, () => [
    this.app,
    this.app?.autosave,
  ]);

  /** The autosave the layout started for `store`, if any */
  private ownAutosave?: LayerAutosave;

  /** The autosave whose errors are shown */
  private watchedAutosave?: LayerAutosave;

  /** Keeps the app settings under the `settings-store` name, if any */
  private ownSettingsAutosave?: SettingsAutosave;

  /** Whether drawing was blocked when shortcuts were last watched */
  private blockedShortcuts = false;

  /** The panels in each side's slot */
  private panels: Record<Side, PcPanel[]> = { left: [], right: [] };

  /** Whether each side's slot has a layers menu (the toolbar's isn't needed then) */
  private sideLayers: Record<Side, boolean> = { left: false, right: false };

  /** Whether the implementer gave a menu */
  private hasMenu = false;

  /** Slots the implementer gave content for (their defaults aren't created) */
  private filled: Record<string, boolean> = {};

  /** Keyboard shortcuts, while handled */
  private keys?: KeyboardShortcuts;

  /** The state last reported, to report only changes */
  private reported?: string;

  /** Space the floating sides cover over the canvas */
  private floatingInsets: Insets = NO_INSETS;

  /** The rail button that opened the open panel, to return focus to */
  private opener?: HTMLElement;

  private readonly resizeObserver?: ResizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(([entry]) => {
          this.width = Math.round(entry?.contentRect.width ?? 0);
        })
      : undefined;

  // Panels' icons, labels and badges show on their rail buttons
  private readonly panelObserver = new MutationObserver(() =>
    this.requestUpdate(),
  );

  // The input being used, from each press
  private readonly onPointerDown = (event: PointerEvent) => {
    const kind = event.pointerType;
    this.input = kind === "pen" || kind === "touch" ? kind : "mouse";
  };

  // Tell the user when the drawing can't be loaded or saved
  private readonly onAutosaveError = () =>
    emit(this, "pc-toast", {
      message: this.t("paintCanvas.autosave.failed"),
      kind: "error",
    });

  private readonly onSettingsAutosaveError = () =>
    emit(this, "pc-toast", {
      message: this.t("paintCanvas.settings.saveFailed"),
      kind: "error",
    });

  // Cmd/Ctrl + S saves a screenshot
  private readonly onShortcut = (event: Event) => {
    if ((event as CustomEvent<ShortcutAction>).detail.type === "save")
      void this.saveScreenshot();
  };

  // A press outside the open panel and its rail button closes it
  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    const panel = this.openPanel;
    if (!panel) return;
    const path = event.composedPath();
    if (!path.includes(panel) && !(this.opener && path.includes(this.opener)))
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
    this.leftModes = DEFAULT_SIDE_MODES;
    this.rightModes = DEFAULT_SIDE_MODES;
    this.narrowWidth = DEFAULT_NARROW_WIDTH;
    this.menuText = "☰";
    this.shortcuts = true;
    this.width = 0;
    this.input = isTouchDevice() ? "touch" : "mouse";
    // Floating sides start as a button, so they don't cover the canvas until wanted
    this.collapsed = { left: true, right: true };
  }

  /** Whether another window is drawing on the stored drawing, so this one is blocked */
  get blocked(): boolean {
    return this.app?.autosave?.state === AutosaveState.Elsewhere;
  }

  /** The layout's state now (see `LayoutState`) */
  get state(): LayoutState {
    return {
      width: this.width,
      narrow: this.width < this.narrowWidth,
      input: this.input,
      uiHidden: this.app?.interfaceVisible === false,
      leftMode: this.modeOf("left"),
      rightMode: this.modeOf("right"),
    };
  }

  /** A side's mode for the layout's width */
  private modeOf(side: Side): SideMode {
    return sideModeFor(
      parseSideModes(side === "left" ? this.leftModes : this.rightModes),
      this.width,
    );
  }

  override connectedCallback(): void {
    this.app ??= new PaintCanvas();
    super.connectedCallback();
    this.resizeObserver?.observe(this);
    this.panelObserver.observe(this, {
      subtree: true,
      attributes: true,
      attributeFilter: ["icon", "label", "badge"],
    });
    this.addEventListener("pointerdown", this.onPointerDown, true);
    this.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.watchShortcuts();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.panelObserver.disconnect();
    this.removeEventListener("pointerdown", this.onPointerDown, true);
    this.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener(
      "pointerdown",
      this.onDocumentPointerDown,
      true,
    );
    this.unwatchShortcuts();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has("app") || changed.has("store"))
      this.useStore(changed.get("app") as PaintCanvas | undefined);
    if (changed.has("app") || changed.has("settingsStore"))
      this.useSettingsStore();
    this.watchAutosaveErrors();
    if (
      this.isConnected &&
      (changed.has("app") ||
        changed.has("shortcuts") ||
        this.blocked !== this.blockedShortcuts)
    )
      this.watchShortcuts();
    // A panel opened from a rail closes when its side stops being a rail
    const panel = this.openPanel;
    if (panel && this.modeOf(this.sideOf(panel)) !== "rail")
      this.closePanel(false);
  }

  protected override updated(): void {
    const state = this.state;
    this.toggleAttribute("narrow", state.narrow);
    this.toggleAttribute("ui-hidden", state.uiHidden);
    this.setAttribute("input", state.input);
    this.setAttribute("left-mode", state.leftMode);
    this.setAttribute("right-mode", state.rightMode);
    const report = JSON.stringify(state);
    if (report !== this.reported) {
      this.reported = report;
      this.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: state }));
    }
    this.measureFloatingSides();
  }

  /** Keep the canvas clear of floating sides when fitting it */
  private measureFloatingSides(): void {
    const width = (side: Side) =>
      this.renderRoot
        .querySelector(`.side.${side} .float:not(.collapsed)`)
        ?.getBoundingClientRect().width ?? 0;
    const insets = { ...NO_INSETS, left: width("left"), right: width("right") };
    if (
      insets.left === this.floatingInsets.left &&
      insets.right === this.floatingInsets.right
    )
      return;
    this.floatingInsets = insets;
    this.requestUpdate();
  }

  /**
   * Keep the canvas's layers under the `store` name, replacing an autosave the layout started earlier (also on the
   * previous canvas). An autosave the implementer started is left alone when there's no name.
   */
  private useStore(previousApp?: PaintCanvas): void {
    const app = this.app as PaintCanvas;
    const own = this.ownAutosave;
    if (own && previousApp?.autosave === own)
      previousApp.useLayerStore(undefined);
    const name = this.store || undefined;
    if (name === undefined) {
      if (own && app.autosave === own)
        this.ownAutosave = app.useLayerStore(undefined);
      return;
    }
    if (app.autosave?.store.name !== name)
      this.ownAutosave = app.useLayerStore(new IndexedDbLayerStore(name));
  }

  /** Keeps the app settings under the `settings-store` name, if any (e.g. to wait until they are restored with `ready`) */
  get settingsAutosave(): SettingsAutosave | undefined {
    return this.ownSettingsAutosave;
  }

  /**
   * Keep the canvas's app settings under the `settings-store` name, stopping the previous settings autosave (which
   * saves any change waiting to be saved).
   */
  private useSettingsStore(): void {
    this.ownSettingsAutosave?.stop();
    const name = this.settingsStore || undefined;
    this.ownSettingsAutosave =
      name === undefined
        ? undefined
        : new SettingsAutosave(
            this.app as PaintCanvas,
            new IndexedDbSettingsStore(name),
          );
    this.ownSettingsAutosave?.addEventListener(
      SETTINGS_AUTOSAVE_ERROR_EVENT,
      this.onSettingsAutosaveError,
    );
  }

  /** Show errors from the canvas's current autosave */
  private watchAutosaveErrors(): void {
    const autosave = this.app?.autosave;
    if (autosave === this.watchedAutosave) return;
    this.watchedAutosave?.removeEventListener(
      AUTOSAVE_ERROR_EVENT,
      this.onAutosaveError,
    );
    this.watchedAutosave = autosave;
    autosave?.addEventListener(AUTOSAVE_ERROR_EVENT, this.onAutosaveError);
  }

  /** Handle keyboard shortcuts for the current canvas, if asked to (not while blocked) */
  private watchShortcuts(): void {
    this.unwatchShortcuts();
    this.blockedShortcuts = this.blocked;
    if (!this.shortcuts || !this.app || this.blockedShortcuts) return;
    this.keys = new KeyboardShortcuts(this.app);
    this.keys.attach(window);
    window.addEventListener(SHORTCUT_EVENT, this.onShortcut);
  }

  /** Stop handling keyboard shortcuts */
  private unwatchShortcuts(): void {
    this.keys?.detach();
    this.keys = undefined;
    window.removeEventListener(SHORTCUT_EVENT, this.onShortcut);
  }

  /**
   * Save the whole canvas as a PNG on white, at full size, including a stroke or transform in progress. Returns how it
   * was saved, or undefined if cancelled.
   */
  async saveScreenshot(): Promise<SaveMethod | undefined> {
    const app = this.app as PaintCanvas;
    const blob = await renderScreenshot(
      app.drawables,
      app.width,
      app.height,
      app.transform.preview ?? app.strokes.preview,
    );
    return this.saveFile(blob, screenshotName(undefined, app.names.filePrefix));
  }

  /** The brush or eraser settings */
  private toolSettings(kind: "brush" | "eraser") {
    const app = this.app as PaintCanvas;
    return kind === "eraser" ? app.eraser : app.brush;
  }

  /**
   * Open the configuration window for the current brush or eraser settings. When the selected preset is one of the
   * user's own, the window can delete it.
   */
  configure(kind: "brush" | "eraser"): void {
    const app = this.app as PaintCanvas;
    const settings = this.toolSettings(kind);
    const selected = settings.selectedPreset;
    const own =
      selected &&
      !app.isBuiltInPreset(selected.id) &&
      isOwnAuthor(selected.author, app.authorHandle, app.names.unknownAuthor);
    this.configuring = {
      kind,
      config: {
        ...settings.preset,
        width: settings.width,
        height: settings.height,
      },
      ...(own ? { editingId: selected.id } : {}),
    };
  }

  /**
   * Open the configuration window to make a new preset, starting from the current brush or eraser settings.
   */
  newPreset(kind: "brush" | "eraser"): void {
    const settings = this.toolSettings(kind);
    this.app?.closePanel();
    this.configuring = {
      kind,
      config: {
        ...settings.preset,
        name: this.t("paintCanvas.brushConfig.newPresetName"),
        width: settings.width,
        height: settings.height,
      },
    };
  }

  /** Which side a panel is in */
  private sideOf(panel: PcPanel): Side {
    return panel.slot === "left" ? "left" : "right";
  }

  /**
   * Open a panel from its rail button (closing any other), or close it if it's open. Focus moves into the panel.
   */
  togglePanel(panel: PcPanel, opener?: HTMLElement): void {
    if (this.openPanel === panel) {
      this.closePanel(true);
      return;
    }
    if (this.openPanel) this.closePanel(false);
    this.openPanel = panel;
    this.opener = opener;
    panel.toggleAttribute("data-pc-open", true);
    const focusable = panel.querySelector<HTMLElement>(FOCUSABLE);
    if (focusable) focusable.focus();
    else {
      panel.tabIndex = -1;
      panel.focus();
    }
  }

  /**
   * Close the panel open from a rail, moving focus back to its rail button if asked.
   */
  closePanel(returnFocus: boolean): void {
    const panel = this.openPanel;
    if (!panel) return;
    panel.removeAttribute("data-pc-open");
    this.openPanel = undefined;
    if (returnFocus) this.opener?.focus();
    this.opener = undefined;
  }

  /** Follow which slots have content given (their defaults aren't needed) */
  private onSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement;
    this.filled = {
      ...this.filled,
      [slot.name]: slot.assignedElements().length > 0,
    };
    this.requestUpdate();
  }

  /** A slot, with its default content unless content was given for it */
  private slotWithDefault(name: string, fallback: unknown) {
    return html`<slot name=${name} @slotchange=${this.onSlotChange}
      >${this.filled[name] ? nothing : fallback}</slot
    >`;
  }

  /** Follow the panels given for a side, and whether it has a layers menu */
  private onSideSlotChange(side: Side, event: Event): void {
    const assigned = (event.target as HTMLSlotElement).assignedElements();
    this.panels = {
      ...this.panels,
      [side]: assigned.filter(
        (element): element is PcPanel => element.localName === "pc-panel",
      ),
    };
    this.sideLayers = {
      ...this.sideLayers,
      [side]: assigned.some((element) =>
        element.matches("pc-layers-menu, :has(pc-layers-menu)"),
      ),
    };
    this.onSlotChange(event);
  }

  /** Follow whether a menu was given */
  private onMenuSlotChange(event: Event): void {
    this.hasMenu =
      (event.target as HTMLSlotElement).assignedElements().length > 0;
    this.requestUpdate();
  }

  /** Whether a side has a layers menu, replacing the toolbar's */
  private get layersInSide(): boolean {
    return this.sideLayers.left || this.sideLayers.right;
  }

  /** The toolbar shown on the left unless the implementer gives other content */
  private renderToolbar(app: PaintCanvas) {
    return html`<pc-toolbar
      .app=${app}
      .menu=${this.hasMenu}
      .layers=${!this.layersInSide}
      .menuText=${this.menuText}
      .menuLabel=${this.menuLabel}
    ></pc-toolbar>`;
  }

  /** A side's rail buttons, one per panel */
  private renderRail(side: Side, label: string) {
    const panels = this.panels[side];
    if (panels.length === 0) return nothing;
    return html`<div
      class="rail"
      part="${side}-rail"
      role="toolbar"
      aria-orientation="vertical"
      aria-label=${label}
    >
      ${panels.map(
        (panel) =>
          html`<button
            type="button"
            title=${panel.label}
            aria-label=${
              panel.badge
                ? this.t("paintCanvas.layout.new", { name: panel.label })
                : panel.label
            }
            aria-expanded=${String(this.openPanel === panel)}
            @click=${(event: Event) =>
              this.togglePanel(panel, event.currentTarget as HTMLElement)}
          >
            <img src=${this.iconUrl(panel.icon)} alt="" />
            ${panel.badge ? html`<span class="badge"></span>` : nothing}
          </button>`,
      )}
    </div>`;
  }

  /** A side, in its mode */
  private renderSide(side: Side, app: PaintCanvas, blocked: boolean) {
    const mode = this.modeOf(side);
    const label = this.t(
      side === "left"
        ? "paintCanvas.layout.tools"
        : "paintCanvas.layout.panels",
    );
    const slot = html`<slot
      name=${side}
      @slotchange=${(event: Event) => this.onSideSlotChange(side, event)}
      >${side === "left" && !this.filled.left ? this.renderToolbar(app) : nothing}</slot
    >`;
    let content: unknown = slot;
    if (mode === "rail")
      content =
        side === "left"
          ? html`${slot}${this.renderRail(side, label)}`
          : html`${this.renderRail(side, label)}${slot}`;
    else if (mode === "floating") {
      const collapsed = this.collapsed[side];
      const arrows = side === "left" ? ["»", "«"] : ["«", "»"];
      content = html`<div
        class=${collapsed ? "float collapsed" : "float"}
        part="${side}-float"
      >
        <button
          type="button"
          class="collapse"
          aria-expanded=${String(!collapsed)}
          aria-label=${this.t(collapsed ? "paintCanvas.layout.show" : "paintCanvas.layout.hide", { name: label })}
          @click=${() =>
            (this.collapsed = { ...this.collapsed, [side]: !collapsed })}
        >
          ${collapsed ? arrows[0] : arrows[1]}
        </button>
        <div class="content" ?hidden=${collapsed}>${slot}</div>
      </div>`;
    }
    return html`<div
      class="side ${side}"
      part=${side}
      data-mode=${mode}
      role="region"
      aria-label=${label}
      ?inert=${blocked}
    >
      ${content}
    </div>`;
  }

  /** The menus the toolbar opens, floating over the canvas beside it */
  private renderPanels(app: PaintCanvas) {
    const brushMenu = (kind: "brush" | "eraser") =>
      html`<pc-brush-menu
        class="panel top-panel"
        kind=${kind}
        .app=${app}
        @pc-new-preset=${() => this.newPreset(kind)}
      ></pc-brush-menu>`;
    return html`${app.panel === Panel.Brush ? brushMenu("brush") : nothing}
      ${app.panel === Panel.Eraser ? brushMenu("eraser") : nothing}
      ${
        app.panel === Panel.Layers && !this.layersInSide
          ? html`<pc-layers-menu class="panel" .app=${app}></pc-layers-menu>`
          : nothing
      }
      <div class="panel menu-panel" ?open=${app.panel === Panel.Menu}>
        <slot name="menu" @slotchange=${this.onMenuSlotChange}></slot>
      </div>`;
  }

  /** The brush configuration window, while open */
  private renderConfig(app: PaintCanvas) {
    const configuring = this.configuring;
    if (!configuring) return nothing;
    return html`<pc-brush-config
      .app=${app}
      kind=${configuring.kind}
      .config=${configuring.config}
      editingId=${configuring.editingId ?? nothing}
      @pc-save=${(event: CustomEvent<BrushConfig>) => {
        this.toolSettings(configuring.kind).apply(event.detail);
        this.configuring = undefined;
      }}
      @pc-close=${() => (this.configuring = undefined)}
    ></pc-brush-config>`;
  }

  /** The message blocking the layout while another window is drawing on the stored drawing */
  private renderBlocked(app: PaintCanvas) {
    const choices: DialogChoice[] = [
      {
        value: TAKE_OVER_CHOICE,
        label: this.t("paintCanvas.autosave.takeOver"),
      },
    ];
    return html`<pc-dialog
      class="elsewhere"
      heading=${this.t("paintCanvas.autosave.elsewhere")}
      message=${this.t("paintCanvas.autosave.elsewhereMessage")}
      .choices=${choices}
      @pc-choose=${(event: CustomEvent<{ value: string }>) => {
        // Escape leaves the message showing: this window can't draw until it takes over
        if (event.detail.value === TAKE_OVER_CHOICE) app.autosave?.takeOver();
      }}
    ></pc-dialog>`;
  }

  override render() {
    const app = this.app as PaintCanvas;
    const showsToolSettings = app.interfaceVisible && hasToolSettings(app.tool);
    const blocked = this.blocked;
    return html`<header part="header" ?inert=${blocked}>
        <slot name="header"></slot>
      </header>
      ${this.renderSide("left", app, blocked)}
      <div
        class="top"
        part="top"
        role="region"
        aria-label=${this.t("paintCanvas.layout.toolSettings")}
        ?inert=${blocked}
      >
        ${this.slotWithDefault(
          "top",
          showsToolSettings
            ? html`<pc-tool-settings
                .app=${app}
                @pc-configure-brush=${(
                  event: CustomEvent<"brush" | "eraser">,
                ) => this.configure(event.detail)}
              ></pc-tool-settings>`
            : nothing,
        )}
      </div>
      <div
        class="center"
        part="center"
        role="region"
        aria-label=${this.t("paintCanvas.layout.canvas")}
        ?inert=${blocked}
      >
        ${this.slotWithDefault(
          "center",
          html`<pc-canvas
            .app=${app}
            .insets=${this.floatingInsets}
          ></pc-canvas>`,
        )}
        <div class="overlay" part="overlay">
          ${this.slotWithDefault(
            "overlay",
            html`<pc-canvas-map
              .app=${app}
              .insets=${this.floatingInsets}
            ></pc-canvas-map>`,
          )}
        </div>
        ${app.interfaceVisible ? this.renderPanels(app) : nothing}
      </div>
      <div
        class="bottom"
        part="bottom"
        role="region"
        aria-label=${this.t("paintCanvas.layout.status")}
        ?inert=${blocked}
      >
        <slot name="bottom"></slot>
      </div>
      ${this.renderSide("right", app, blocked)}
      <footer part="footer" ?inert=${blocked}>
        ${this.slotWithDefault("footer", html`<pc-stats .app=${app}></pc-stats>`)}
      </footer>
      ${this.renderConfig(app)} ${blocked ? this.renderBlocked(app) : nothing}`;
  }
}

defineElement("paint-canvas", PaintCanvasElement);
