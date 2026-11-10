import { css, html, nothing } from "lit";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import PaintCanvas, { Tool } from "../../../lib/classes/PaintCanvas";
import "../PcButtonMenu";

/** The tools that cut, copy and paste are shown for: the brush, eraser, lassos and Move tool */
export const CLIPBOARD_TOOLS: readonly Tool[] = [
  Tool.Brush,
  Tool.Eraser,
  Tool.RectangleLasso,
  Tool.CircleLasso,
  Tool.PolygonLasso,
  Tool.FreeformLasso,
  Tool.Move,
];

/** Window width (CSS pixels) below which the clipboard tools are one ⋮ menu */
export const CLIPBOARD_MENU_BELOW = 900;

/** A clipboard action: its name (class and menu value), label, whether it can be done, and what it does */
interface ClipboardAction {
  name: "cut" | "copy" | "copy-merged" | "paste";
  label: string;
  disabled: boolean;
  run(): void;
}

/**
 * Cut, copy, copy merged and paste buttons for the canvas's masked image data, shown for the brush, eraser, lassos and
 * Move tool (see `CLIPBOARD_TOOLS`). "Copy merged" copies the shown layers mixed as shown (see `PaintCanvas.copyMerged`).
 * Cut and both copies work while there's a mask and no transform is pending; paste while there's copied image data.
 * They're one ⋮ menu instead while the window is narrower than `CLIPBOARD_MENU_BELOW` (900px), or while `narrow` (see
 * `pc-button-menu`).
 *
 * `<paint-canvas>` puts it at the end of its top pane, after the tool settings.
 *
 * @example
 * html`<pc-clipboard-tools .app=${app} ?narrow=${narrow}></pc-clipboard-tools>`
 */
export class PcClipboardTools extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    narrow: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: flex;
        flex: none;
        align-items: center;
        padding: 4px 8px;
        background: var(--pc-bar);
        border-bottom: 1px solid var(--pc-surface-active);
      }
      :host([hidden]) {
        display: none;
      }
    `,
  ];

  declare app?: PaintCanvas;

  /** Whether the buttons are one ⋮ menu whatever the window's width (e.g. while the layout is narrow) */
  declare narrow: boolean;

  private changes = new ChangeController(this, () =>
    this.app ? [this.app, this.app.selection, this.app.transform] : [],
  );

  constructor() {
    super();
    this.narrow = false;
  }

  /** Cut, copy, copy merged and paste, each with whether it can be done now */
  private actions(app: PaintCanvas): ClipboardAction[] {
    const noCopy = !app.selection.active || app.transform.pending;
    return [
      {
        name: "cut",
        label: this.t("paintCanvas.common.cut"),
        disabled: noCopy,
        run: () => app.cut(),
      },
      {
        name: "copy",
        label: this.t("paintCanvas.common.copy"),
        disabled: noCopy,
        run: () => app.copy(),
      },
      {
        name: "copy-merged",
        label: this.t("paintCanvas.common.copyMerged"),
        disabled: noCopy,
        run: () => app.copyMerged(),
      },
      {
        name: "paste",
        label: this.t("paintCanvas.common.paste"),
        disabled: !app.hasClipboard,
        run: () => app.paste(),
      },
    ];
  }

  /** Hide for tools without clipboard actions (e.g. zoom) */
  protected override willUpdate(): void {
    this.hidden = !this.app || !CLIPBOARD_TOOLS.includes(this.app.tool);
  }

  override render() {
    const app = this.app;
    if (!app || this.hidden) return nothing;
    const actions = this.actions(app);
    return html`<pc-button-menu
      size="pill-s"
      label=${this.t("paintCanvas.toolSettings.moreActions")}
      menu-below=${CLIPBOARD_MENU_BELOW}
      ?menu=${this.narrow}
      .items=${actions.map(({ name, label, disabled }) => ({
        value: name,
        label,
        disabled,
      }))}
      @pc-select=${(event: CustomEvent<{ value: string }>) => {
        event.stopPropagation();
        actions.find((action) => action.name === event.detail.value)?.run();
      }}
    ></pc-button-menu>`;
  }
}

defineElement("pc-clipboard-tools", PcClipboardTools);
