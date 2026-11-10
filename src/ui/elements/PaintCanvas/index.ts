import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { PcElement, defineElement, emit } from "../../base";
import { markDismissingPress } from "../../dismiss";
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
  loadRenderingChoice,
  saveRenderingChoice,
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
import "../PcPanel";
import { PcPane, PANE_COLLAPSE_EVENT } from "../PcPane";
import { PcToolbar } from "../PcToolbar";
import "../PcToolSettings";
import "../PcClipboardTools";
import "../PcCanvas";
import "../PcCanvasMap";
import "../PcPanelBrushes";
import "../PcPanelLayers";
import "../PcBrushConfig";
import "../PcStats";
import "../PcPanelColours";
import "../PcDialog";
import type { DialogChoice } from "../PcDialog";

/** A side of the layout */
type Side = "left" | "right";

/** The sides */
const SIDES: readonly Side[] = ["left", "right"];

/** No space kept clear */
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The choice that takes the drawing over from another window */
const TAKE_OVER_CHOICE = "take-over";

/**
 * A ready-made painting app: the drawing elements arranged around the canvas, sized to its container (not the
 * window), with slots to add or replace content:
 *
 * - `header`: across the top (empty by default)
 * - `left`: `<pc-toolbar>` (a pane) by default; toolbars in the sides are minimised (their tools one button that opens a
 *   menu of them) while the layout is narrow
 * - `top`: a horizontal `<pc-pane>` with `<pc-tool-settings>` (for tools that have settings) and, at its end,
 *   `<pc-clipboard-tools>` (cut, copy and paste; a ⋮ menu while the layout is narrow or the window is narrower than
 *   900px) by default
 * - `right`: a `<pc-pane>` with `<pc-panel-layers>` by default
 * - `center`: `<pc-canvas>` by default
 * - `overlay`: drawn over the canvas; `<pc-canvas-map>` by default
 * - `bottom`: under the canvas (empty by default)
 * - `footer`: across the bottom; `<pc-stats>` by default
 * - `menu`: the app menu the toolbar's menu button opens, shown in a `<pc-panel>` (the button shows only with a menu)
 *
 * Content given for a slot replaces its default; an empty element clears it. Empty slots take no space. Hiding the
 * interface (Tab key) leaves only the canvas and overlay. While a side has a `<pc-panel-layers>` (as the right side
 * does by default), the toolbar has no layers menu button.
 *
 * Each side has a mode, chosen by the layout's width from `left-modes` and `right-modes` (default `"docked,
 * floating@600"`), which the layout gives the side's `<pc-pane>`s (see `PcPane`): `docked` beside the canvas; `rail`, a
 * column of buttons (one per panel) that open each panel over the canvas; `floating`, the pane over the canvas as a
 * box that collapses to a button; or `overlay`, a rail over the canvas without a background (the canvas fills the
 * width behind it). Give side content in a `<pc-pane>` to have it follow the side's mode.
 *
 * Reports its state for styling as attributes (`narrow`, `input="pen|touch|mouse"`, `ui-hidden`, `left-mode`,
 * `right-mode`) and as `pc-state-change` events (see `LayoutState`). Creates its own canvas unless given one, and
 * handles keyboard shortcuts unless `shortcuts` is false.
 *
 * With a `store` name, the user's layers are kept in the browser (IndexedDB) under that name, so the drawing survives
 * reloading the page (see `LayerAutosave`). While another window is drawing on it, the layout is blocked by a message
 * that offers to draw here instead. Fires `pc-toast` when the drawing can't be loaded or saved.
 *
 * With a `settings-store` name, the user's app settings (input settings, keyboard shortcuts, colour palette, colours,
 * theme, language and rendering) are kept in the browser under that name (see `SettingsAutosave`). Fires `pc-toast` when
 * they can't be. The rendering chosen there is also kept in `localStorage` (see `saveRenderingChoice`), so the canvas the
 * layout makes draws where the user last chose (see `PaintCanvasOptions.rendering`).
 *
 * @example
 * html`<paint-canvas style="height: 600px"></paint-canvas>`
 * html`<paint-canvas .app=${canvas} right-modes="docked, rail@800">
 *   <pc-pane slot="right">
 *     <pc-panel-layers .app=${canvas}></pc-panel-layers>
 *     <pc-panel icon="chat" label="Chat"><my-chat></my-chat></pc-panel>
 *   </pc-pane>
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

  /** Stops keeping the rendering chosen in the canvas's UI settings under the `settings-store` name, if kept */
  private stopKeepingRendering?: () => void;

  /** Whether drawing was blocked when shortcuts were last watched */
  private blockedShortcuts = false;

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

  /** Space the floating and overlay sides cover over the canvas */
  private floatingInsets: Insets = NO_INSETS;

  private readonly resizeObserver?: ResizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(([entry]) => {
          this.width = Math.round(entry?.contentRect.width ?? 0);
        })
      : undefined;

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

  // A press outside the colour palette closes it
  private readonly onDocumentPointerDown = (event: PointerEvent) =>
    this.closePanelOutside(event);

  // A floating pane's size changes when it's shown or collapsed
  private readonly onPaneCollapse = () => this.requestUpdate();

  constructor() {
    super();
    this.leftModes = DEFAULT_SIDE_MODES;
    this.rightModes = DEFAULT_SIDE_MODES;
    this.narrowWidth = DEFAULT_NARROW_WIDTH;
    this.menuText = "☰";
    this.shortcuts = true;
    this.width = 0;
    this.input = isTouchDevice() ? "touch" : "mouse";
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
    // Draw where the user chose last time; the choice can't change once the canvas is made
    this.app ??= new PaintCanvas({
      rendering: this.settingsStore
        ? loadRenderingChoice(this.settingsStore)
        : undefined,
    });
    super.connectedCallback();
    this.resizeObserver?.observe(this);
    this.addEventListener("pointerdown", this.onPointerDown, true);
    this.addEventListener(PANE_COLLAPSE_EVENT, this.onPaneCollapse);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.watchShortcuts();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.removeEventListener("pointerdown", this.onPointerDown, true);
    this.removeEventListener(PANE_COLLAPSE_EVENT, this.onPaneCollapse);
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
    this.setPaneModes();
    this.measureFloatingSides();
  }

  /** The panes in a side: the default one, or those given for it */
  private panesIn(side: Side): PcPane[] {
    // Asked after rendering, so the side's slot is there
    const slot = this.renderRoot.querySelector(
      `slot[name="${side}"]`,
    ) as HTMLSlotElement;
    const given = slot.assignedElements();
    const content = given.length ? given : [...slot.children];
    return content.filter(
      (element): element is PcPane => element instanceof PcPane,
    );
  }

  /** Show each side's panes in the side's mode, facing the canvas, with toolbars minimised while the layout is narrow */
  private setPaneModes(): void {
    const narrow = this.width < this.narrowWidth;
    for (const side of SIDES)
      for (const pane of this.panesIn(side)) {
        pane.mode = this.modeOf(side);
        pane.edge = side;
        if (pane instanceof PcToolbar) pane.minimised = narrow;
      }
  }

  /** Keep the canvas clear of floating and overlay sides when fitting it */
  private measureFloatingSides(): void {
    const width = (side: Side) =>
      this.panesIn(side)
        .filter((pane) =>
          pane.mode === "floating" ? !pane.collapsed : pane.mode === "overlay",
        )
        .reduce(
          (widest, pane) =>
            Math.max(widest, pane.getBoundingClientRect().width),
          0,
        );
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
    this.stopKeepingRendering?.();
    const name = this.settingsStore || undefined;
    this.stopKeepingRendering =
      name === undefined ? undefined : this.keepRendering(name);
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

  /**
   * Keep the rendering chosen in the canvas's UI settings (e.g. when they're restored, imported or changed) under a
   * name, for the next time the layout makes a canvas. Returns what stops it.
   */
  private keepRendering(name: string): () => void {
    const ui = (this.app as PaintCanvas).ui;
    const keep = () => saveRenderingChoice(name, ui.data.rendering);
    ui.addEventListener("change", keep);
    return () => ui.removeEventListener("change", keep);
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

  /** Follow whether a side given content has a layers menu */
  private onSideSlotChange(side: Side, event: Event): void {
    const assigned = (event.target as HTMLSlotElement).assignedElements();
    this.sideLayers = {
      ...this.sideLayers,
      [side]: assigned.some((element) =>
        element.matches("pc-panel-layers, :has(pc-panel-layers)"),
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
    // The right side's default pane has one
    return this.sideLayers.left || this.sideLayers.right || !this.filled.right;
  }

  /** A side's default content: the toolbar on the left, and the layers on the right */
  private renderSideDefault(side: Side, app: PaintCanvas, label: string) {
    if (side === "left")
      return html`<pc-toolbar
        .app=${app}
        .menu=${this.hasMenu}
        .layers=${!this.layersInSide}
        .menuText=${this.menuText}
        .menuLabel=${this.menuLabel}
        label=${label}
      ></pc-toolbar>`;
    return html`<pc-pane label=${label}
      ><pc-panel-layers slot="start" .app=${app}></pc-panel-layers
    ></pc-pane>`;
  }

  /** A side: its panes, in its mode (set on them after rendering) */
  private renderSide(side: Side, app: PaintCanvas, blocked: boolean) {
    const label = this.t(
      side === "left"
        ? "paintCanvas.layout.tools"
        : "paintCanvas.layout.panels",
    );
    return html`<div
      class="side ${side}"
      part=${side}
      data-mode=${this.modeOf(side)}
      role="region"
      aria-label=${label}
      ?inert=${blocked}
    >
      <slot
        name=${side}
        @slotchange=${(event: Event) => this.onSideSlotChange(side, event)}
        >${this.filled[side] ? nothing : this.renderSideDefault(side, app, label)}</slot
      >
    </div>`;
  }

  /**
   * Close the open panel (brush, eraser, layers, app menu or colour palette) on a press outside it and the button that
   * opens it, marking the press (see `markDismissingPress`) so the canvas doesn't draw unless it's dragged. Presses in
   * dialogs (e.g. one the panel opened) don't count as outside.
   */
  private closePanelOutside(event: PointerEvent): void {
    const panel = this.app?.panel;
    if (!panel) return;
    const inside = event.composedPath().some(
      (target) =>
        target instanceof Element &&
        // The open panel (the layout's floating ones), and dialogs
        ((target.classList.contains("panel") &&
          target.getRootNode() === this.renderRoot) ||
          target.matches("dialog, pc-dialog, pc-dialog-window") ||
          target.getAttribute("data-panel") === panel ||
          (panel === Panel.Palette && target.localName === "pc-colour-pair")),
    );
    if (inside) return;
    markDismissingPress(event);
    (this.app as PaintCanvas).closePanel();
  }

  /** The menus the toolbar opens, floating over the canvas beside it */
  private renderPanels(app: PaintCanvas) {
    const brushMenu = (kind: "brush" | "eraser") =>
      html`<pc-panel-brushes
        class="panel top-panel"
        kind=${kind}
        .app=${app}
        @pc-new-preset=${() => this.newPreset(kind)}
      ></pc-panel-brushes>`;
    return html`${app.panel === Panel.Brush ? brushMenu("brush") : nothing}
      ${app.panel === Panel.Eraser ? brushMenu("eraser") : nothing}
      ${
        app.panel === Panel.Layers && !this.layersInSide
          ? html`<pc-panel-layers class="panel" .app=${app}></pc-panel-layers>`
          : nothing
      }
      ${
        app.panel === Panel.Palette
          ? html`<pc-panel-colours
              class="panel top-panel"
              .app=${app}
            ></pc-panel-colours>`
          : nothing
      }
      <pc-panel
        class="panel menu-panel"
        label=${this.menuLabel || this.t("paintCanvas.toolbar.menu")}
        ?open=${app.panel === Panel.Menu}
      >
        <slot name="menu" @slotchange=${this.onMenuSlotChange}></slot>
      </pc-panel>`;
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
    // Over the layout only (not the whole page), and not dismissed: this window can't draw until it takes over
    return html`<pc-dialog
      class="elsewhere"
      inline
      .dismissible=${false}
      heading=${this.t("paintCanvas.autosave.elsewhere")}
      message=${this.t("paintCanvas.autosave.elsewhereMessage")}
      .choices=${choices}
      @pc-choose=${(event: CustomEvent<{ value: string }>) => {
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
            ? html`<pc-pane orientation="horizontal" edge="top"
                ><pc-tool-settings
                  slot="middle"
                  .app=${app}
                  @pc-configure-brush=${(
                    event: CustomEvent<"brush" | "eraser">,
                  ) => this.configure(event.detail)}
                ></pc-tool-settings
                ><pc-clipboard-tools
                  slot="end"
                  .app=${app}
                  ?narrow=${this.width < this.narrowWidth}
                ></pc-clipboard-tools
              ></pc-pane>`
            : nothing,
        )}
      </div>
      <div
        class="center"
        part="center"
        style="--pc-left-inset: ${this.floatingInsets.left}px"
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
