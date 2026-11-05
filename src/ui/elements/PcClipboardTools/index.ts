import { css, html, nothing, unsafeCSS } from "lit";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import { PILLS_CSS } from "../../styles";
import PaintCanvas, { Tool } from "../../../lib/classes/PaintCanvas";
import type { MenuItem } from "../PcMenu";
import "../PcContextMenu";

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

/** A clipboard action: its name (class and menu value), label, whether it can be done, and what it does */
interface ClipboardAction {
  name: "cut" | "copy" | "paste";
  label: string;
  disabled: boolean;
  run(): void;
}

/**
 * Cut, copy and paste buttons for the canvas's masked image data, shown for the brush, eraser, lassos and Move tool
 * (see `CLIPBOARD_TOOLS`). Cut and copy work while there's a mask and no transform is pending; paste while there's
 * copied image data. While `narrow`, they're one ⋮ menu (`pc-context-menu`) instead.
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
    unsafeCSS(PILLS_CSS),
    css`
      :host {
        display: flex;
        flex: none;
        align-items: center;
        gap: 8px;
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

  /** Whether the buttons are one ⋮ menu (e.g. while the layout is narrow) */
  declare narrow: boolean;

  private changes = new ChangeController(this, () =>
    this.app ? [this.app, this.app.selection, this.app.transform] : [],
  );

  constructor() {
    super();
    this.narrow = false;
  }

  /** Cut, copy and paste, each with whether it can be done now */
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
    if (this.narrow)
      return html`<pc-context-menu
        class="more"
        label=${this.t("paintCanvas.toolSettings.moreActions")}
        .items=${actions.map(({ name, label, disabled }): MenuItem => ({
          value: name,
          label,
          disabled,
        }))}
        @pc-select=${(event: CustomEvent<{ value: string }>) =>
          actions.find((action) => action.name === event.detail.value)?.run()}
      ></pc-context-menu>`;
    return actions.map(
      (action) =>
        html`<button
          type="button"
          class="pill ${action.name}"
          ?disabled=${action.disabled}
          @click=${action.run}
        >
          ${action.label}
        </button>`,
    );
  }
}

defineElement("pc-clipboard-tools", PcClipboardTools);
