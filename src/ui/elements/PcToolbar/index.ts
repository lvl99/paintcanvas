import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { NO_TEXT_SELECTION_CSS as noTextSelection } from "../../styles";
import { defineElement } from "../../base";
import { PcPane } from "../PcPane";
import ChangeController from "../../ChangeController";
import {
  Panel,
  Tool,
  type ColourSlot,
  type default as PaintCanvas,
} from "../../../lib/classes/PaintCanvas";
import { cmdSymbol, shortcutLabel } from "../../../lib/utils/shortcuts";
import type { MenuEntry } from "../PcMenu";
import "../PcColourPair";
import "../PcContextMenu";
import "../PcIcon";

/** Toolbar buttons in display order: tool, icon name, translation key of its name, and its keyboard shortcut action */
export const TOOLBAR_TOOLS: readonly {
  tool: Tool;
  /** The button's icon, by name in the icon registry */
  icon: string;
  /** Translation key of the tool's name */
  name: string;
  /** ID of the tool's keyboard shortcut action (see `SHORTCUT_DEFINITIONS`), whose key combination is shown with its name */
  shortcutId: string;
}[] = [
  {
    tool: Tool.Brush,
    icon: "brush",
    name: "paintCanvas.tool.brush",
    shortcutId: "tool-brush",
  },
  {
    tool: Tool.Eraser,
    icon: "eraser",
    name: "paintCanvas.tool.eraser",
    shortcutId: "tool-eraser",
  },
  {
    tool: Tool.Move,
    icon: "cursor",
    name: "paintCanvas.tool.move",
    shortcutId: "tool-move",
  },
  {
    tool: Tool.RectangleLasso,
    icon: "rectangleMask",
    name: "paintCanvas.tool.rectangleLasso",
    shortcutId: "tool-rectangle-mask",
  },
  {
    tool: Tool.CircleLasso,
    icon: "circleMask",
    name: "paintCanvas.tool.circleLasso",
    shortcutId: "tool-circle-mask",
  },
  {
    tool: Tool.PolygonLasso,
    icon: "polygonMask",
    name: "paintCanvas.tool.polygonLasso",
    shortcutId: "tool-polygon-mask",
  },
  {
    tool: Tool.FreeformLasso,
    icon: "freehandMask",
    name: "paintCanvas.tool.freeformLasso",
    shortcutId: "tool-freehand-mask",
  },
  {
    tool: Tool.Pan,
    icon: "pan",
    name: "paintCanvas.tool.pan",
    shortcutId: "pan",
  },
  {
    tool: Tool.Zoom,
    icon: "zoom",
    name: "paintCanvas.tool.zoom",
    shortcutId: "tool-zoom",
  },
  {
    tool: Tool.ColourSample,
    icon: "eyedropper",
    name: "paintCanvas.tool.colourSample",
    shortcutId: "tool-colour-sample",
  },
];

/**
 * Vertical toolbar: the foreground and background colours, tools, undo and redo (disabled when there is nothing to undo
 * or redo), layers menu toggle (unless `layers` is false) and app menu toggle. Pressing a colour selects it and opens the
 * colour palette (if it isn't open). Tools, undo, redo and the layers toggle show
 * their icons; tools have the user's keyboard shortcuts in their tooltips, and undo and redo theirs (⌘ on Apple
 * devices, ^ elsewhere). The app menu button shows `menuText` and is named `menuLabel` for screen readers.
 *
 * While `minimised` (set by `<paint-canvas>` when its layout is narrow, below 600px by default), the tools are one button
 * showing the current tool's icon, which opens a menu (`pc-menu`) of the tools.
 *
 * It's a `PcPane`: the colours and tools are at its start, and undo, redo, the layers toggle and the app menu toggle at
 * its end, after anything slotted there.
 *
 * @example
 * html`<pc-toolbar .app=${app} menuText="App" menuLabel="App menu"></pc-toolbar>`
 */
export class PcToolbar extends PcPane {
  static override properties = {
    ...PcPane.properties,
    app: { attribute: false },
    menuText: { type: String },
    menuLabel: { type: String },
    menu: { type: Boolean },
    layers: { type: Boolean },
    minimised: { type: Boolean, reflect: true },
  };

  static override styles = [
    ...PcPane.styles,
    unsafeCSS(noTextSelection),
    unsafeCSS(styles),
  ];

  declare app?: PaintCanvas;

  /** Whether to show the app menu button (default true) */
  declare menu: boolean;

  /** Whether to show the layers menu button (default true; e.g. false when the layers are shown elsewhere) */
  declare layers: boolean;

  /** Whether the tools are one button that opens a menu of them, to save space (default false) */
  declare minimised: boolean;

  /** What the app menu button shows (default ☰) */
  declare menuText: string;

  /** The app menu button's name for screen readers (default "Menu", translated) */
  declare menuLabel?: string;

  constructor() {
    super();
    this.menuText = "☰";
    this.menu = true;
    this.layers = true;
    this.minimised = false;
  }

  private changes = new ChangeController(this, () => [
    this.app,
    this.app?.history,
    this.app?.shortcuts,
  ]);

  /**
   * Select a tool (the brush and eraser presets open from the settings bar, not here).
   */
  private onToolClick(tool: Tool): void {
    this.app?.selectTool(tool, { fromToolbar: true });
  }

  /**
   * Select the pressed colour, and open the colour palette if it isn't open.
   */
  private onColourClick(event: CustomEvent<{ slot: ColourSlot }>): void {
    const app = this.app as PaintCanvas;
    app.selectColour(event.detail.slot);
    if (app.panel !== Panel.Palette) app.togglePanel(Panel.Palette);
  }

  /** A tool's name, with its keyboard shortcut if it has one */
  private toolLabel(
    app: PaintCanvas,
    name: string,
    shortcutId: string,
  ): string {
    const combo = app.shortcuts.combo(shortcutId);
    return combo
      ? this.t("paintCanvas.tool.withShortcut", {
          tool: this.t(name),
          shortcut: shortcutLabel(combo),
        })
      : this.t(name);
  }

  /** The tools' buttons */
  private renderToolButtons(app: PaintCanvas) {
    return TOOLBAR_TOOLS.map(({ tool, icon, name, shortcutId }) => {
      const label = this.toolLabel(app, name, shortcutId);
      return html`<button
        type="button"
        data-tool=${tool}
        title=${label}
        aria-label=${label}
        aria-pressed=${app.tool === tool}
        @click=${() => this.onToolClick(tool)}
      >
        <img src=${this.iconUrl(icon)} alt="" />
      </button>`;
    });
  }

  /** The tools as one button, showing the current tool, that opens a menu of them */
  private renderToolMenu(app: PaintCanvas) {
    // Every tool is in the toolbar
    const current = TOOLBAR_TOOLS.find(
      ({ tool }) => tool === app.tool,
    ) as (typeof TOOLBAR_TOOLS)[number];
    const items: MenuEntry[] = [
      { type: "label", label: this.t("paintCanvas.toolbar.label") },
      ...TOOLBAR_TOOLS.map(({ tool, icon, name, shortcutId }) => ({
        value: tool,
        label: this.t(name),
        icon,
        shortcut: app.shortcuts.combo(shortcutId) ?? undefined,
        selected: tool === app.tool,
      })),
    ];
    const label = this.toolLabel(app, current.name, current.shortcutId);
    return html`<pc-context-menu
      class="tool-menu"
      placement="beside"
      data-tool=${current.tool}
      title=${label}
      label=${label}
      menu-label=${this.t("paintCanvas.toolbar.label")}
      .items=${items}
      @pc-select=${(event: CustomEvent<{ value: string }>) =>
        this.onToolClick(event.detail.value as Tool)}
    >
      <img slot="icon" src=${this.iconUrl(current.icon)} alt="" />
    </pc-context-menu>`;
  }

  /** The colours and tools */
  protected override renderStart() {
    const app = this.app;
    if (!app) return nothing;
    return html`<pc-colour-pair
        .app=${app}
        @pc-colour-click=${this.onColourClick}
      ></pc-colour-pair>
      ${this.minimised ? this.renderToolMenu(app) : this.renderToolButtons(app)}`;
  }

  /** The space between the tools and the end */
  protected override renderMiddle() {
    return html`<div class="spacer"></div>`;
  }

  /** Undo, redo, and the layers and app menu toggles */
  protected override renderEnd() {
    const app = this.app;
    if (!app) return nothing;
    const cmd = cmdSymbol();
    // The key's name for assistive technology
    const cmdKey = cmd === "⌘" ? "Meta" : "Control";
    return html`<button
        type="button"
        data-action="undo"
        title=${this.t("paintCanvas.toolbar.undoWithShortcut", { shortcut: `${cmd}Z` })}
        aria-label=${this.t("paintCanvas.common.undo")}
        aria-keyshortcuts="${cmdKey}+Z"
        ?disabled=${!app.history.canUndo}
        @click=${() => app.undo()}
      >
        <img src=${this.iconUrl("undo")} alt="" />
      </button>
      <button
        type="button"
        data-action="redo"
        title=${this.t("paintCanvas.toolbar.redoWithShortcut", { shortcut: `⇧${cmd}Z` })}
        aria-label=${this.t("paintCanvas.common.redo")}
        aria-keyshortcuts="Shift+${cmdKey}+Z"
        ?disabled=${!app.history.canRedo}
        @click=${() => app.redo()}
      >
        <img src=${this.iconUrl("redo")} alt="" />
      </button>
      ${
        this.layers
          ? html`<button
              type="button"
              data-panel=${Panel.Layers}
              title=${this.t("paintCanvas.toolbar.layers")}
              aria-label=${this.t("paintCanvas.toolbar.layers")}
              aria-expanded=${app.panel === Panel.Layers}
              @click=${() => app.togglePanel(Panel.Layers)}
            >
              <img src=${this.iconUrl("layers")} alt="" />
            </button>`
          : nothing
      }
      ${
        this.menu
          ? html`<button
              type="button"
              data-panel=${Panel.Menu}
              aria-label=${this.menuLabel || this.t("paintCanvas.toolbar.menu")}
              aria-expanded=${app.panel === Panel.Menu}
              @click=${() => app.togglePanel(Panel.Menu)}
            >
              ${this.menuText}
            </button>`
          : nothing
      }`;
  }
}

defineElement("pc-toolbar", PcToolbar);
