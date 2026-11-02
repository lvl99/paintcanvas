import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { NO_TEXT_SELECTION_CSS as noTextSelection } from "../../styles";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import {
  Panel,
  Tool,
  type default as PaintCanvas,
} from "../../../lib/classes/PaintCanvas";
import { cmdSymbol } from "../../../lib/utils/shortcuts";

/** Toolbar buttons in display order: tool, icon name, translation key of its name, and its keyboard shortcut */
export const TOOLBAR_TOOLS: readonly {
  tool: Tool;
  /** The button's icon, by name in the icon registry */
  icon: string;
  /** Translation key of the tool's name */
  name: string;
  /** The tool's keyboard shortcut, shown with its name */
  shortcut: string;
}[] = [
  { tool: Tool.Brush, icon: "brush", name: "tool.brush", shortcut: "B" },
  { tool: Tool.Eraser, icon: "eraser", name: "tool.eraser", shortcut: "E" },
  { tool: Tool.Move, icon: "cursor", name: "tool.move", shortcut: "V" },
  {
    tool: Tool.RectangleLasso,
    icon: "rectangleMask",
    name: "tool.rectangleLasso",
    shortcut: "M",
  },
  {
    tool: Tool.CircleLasso,
    icon: "circleMask",
    name: "tool.circleLasso",
    shortcut: "Shift+M",
  },
  {
    tool: Tool.PolygonLasso,
    icon: "polygonMask",
    name: "tool.polygonLasso",
    shortcut: "L",
  },
  {
    tool: Tool.FreeformLasso,
    icon: "freehandMask",
    name: "tool.freeformLasso",
    shortcut: "Shift+L",
  },
  { tool: Tool.Pan, icon: "pan", name: "tool.pan", shortcut: "Space" },
  { tool: Tool.Zoom, icon: "zoom", name: "tool.zoom", shortcut: "Z" },
  {
    tool: Tool.ColourSample,
    icon: "eyedropper",
    name: "tool.colourSample",
    shortcut: "I",
  },
];

/**
 * Vertical toolbar: current colour, tools, undo and redo (disabled when there is nothing to undo or redo), layers menu
 * toggle and app menu toggle. Tools, undo, redo and the layers toggle show their icons; undo and redo have their
 * shortcuts (⌘ on Apple devices, ^ elsewhere) in their tooltips. The app menu button shows `menuText` and is named
 * `menuLabel` for screen readers.
 *
 * @example
 * html`<pc-toolbar .app=${app} menuText="App" menuLabel="App menu"></pc-toolbar>`
 */
export class PcToolbar extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    menuText: { type: String },
    menuLabel: { type: String },
    menu: { type: Boolean },
  };

  static override styles = [
    PcElement.styles,
    unsafeCSS(noTextSelection),
    unsafeCSS(styles),
  ];

  declare app?: PaintCanvas;

  /** Whether to show the app menu button (default true) */
  declare menu: boolean;

  /** What the app menu button shows (default ☰) */
  declare menuText: string;

  /** The app menu button's name for screen readers (default "Menu", translated) */
  declare menuLabel?: string;

  constructor() {
    super();
    this.menuText = "☰";
    this.menu = true;
  }

  private changes = new ChangeController(this, () => [
    this.app,
    this.app?.history,
  ]);

  /**
   * Select a tool (the brush and eraser presets open from the settings bar, not here).
   */
  private onToolClick(tool: Tool): void {
    this.app?.selectTool(tool, { fromToolbar: true });
  }

  /**
   * Update the drawing colour from the colour input.
   */
  private onColourInput(event: Event): void {
    this.app?.setColour((event.target as HTMLInputElement).value);
  }

  override render() {
    const app = this.app;
    if (!app) return html``;
    const cmd = cmdSymbol();
    // The key's name for assistive technology
    const cmdKey = cmd === "⌘" ? "Meta" : "Control";
    return html`
      <input
        type="color"
        aria-label=${this.t("toolbar.currentColour")}
        .value=${app.colour}
        @input=${this.onColourInput}
      />
      ${TOOLBAR_TOOLS.map(({ tool, icon, name, shortcut }) => {
        const label = this.t("tool.withShortcut", {
          tool: this.t(name),
          shortcut,
        });
        return html`
          <button
            type="button"
            data-tool=${tool}
            title=${label}
            aria-label=${label}
            aria-pressed=${app.tool === tool}
            @click=${() => this.onToolClick(tool)}
          >
            <img src=${this.iconUrl(icon)} alt="" />
          </button>
        `;
      })}
      <div class="spacer"></div>
      <button
        type="button"
        data-action="undo"
        title=${this.t("toolbar.undoWithShortcut", { shortcut: `${cmd}Z` })}
        aria-label=${this.t("common.undo")}
        aria-keyshortcuts="${cmdKey}+Z"
        ?disabled=${!app.history.canUndo}
        @click=${() => app.undo()}
      >
        <img src=${this.iconUrl("undo")} alt="" />
      </button>
      <button
        type="button"
        data-action="redo"
        title=${this.t("toolbar.redoWithShortcut", { shortcut: `⇧${cmd}Z` })}
        aria-label=${this.t("common.redo")}
        aria-keyshortcuts="Shift+${cmdKey}+Z"
        ?disabled=${!app.history.canRedo}
        @click=${() => app.redo()}
      >
        <img src=${this.iconUrl("redo")} alt="" />
      </button>
      <button
        type="button"
        data-panel=${Panel.Layers}
        title=${this.t("toolbar.layers")}
        aria-label=${this.t("toolbar.layers")}
        aria-expanded=${app.panel === Panel.Layers}
        @click=${() => app.togglePanel(Panel.Layers)}
      >
        <img src=${this.iconUrl("layers")} alt="" />
      </button>
      ${
        this.menu
          ? html`<button
              type="button"
              data-panel=${Panel.Menu}
              aria-label=${this.menuLabel || this.t("toolbar.menu")}
              aria-expanded=${app.panel === Panel.Menu}
              @click=${() => app.togglePanel(Panel.Menu)}
            >
              ${this.menuText}
            </button>`
          : nothing
      }
    `;
  }
}

defineElement("pc-toolbar", PcToolbar);
