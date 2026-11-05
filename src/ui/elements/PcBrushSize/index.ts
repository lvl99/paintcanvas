import { css, html, nothing } from "lit";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import { PointerDrag } from "../../drag";
import {
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  type default as BrushSettings,
} from "../../../lib/classes/BrushSettings";

/**
 * A brush's size as text: one number when the width and height are the same, otherwise "width × height".
 *
 * @example
 * sizeText({ width: 20, height: 20 }); // "20"
 * sizeText({ width: 30, height: 10 }); // "30 × 10"
 */
export const sizeText = ({
  width,
  height,
}: {
  width: number;
  height: number;
}): string => (width === height ? String(width) : `${width} × ${height}`);

/**
 * A brush or eraser's size, which changes it when pressed and dragged: right or up makes it bigger, left or down
 * smaller, keeping its proportions (see `BrushSettings.resize`). With keyboard focus, the arrow keys change it by a
 * pixel and Page Up and Page Down by a step.
 *
 * @example
 * html`<pc-brush-size .settings=${app.brush} label="Brush size"></pc-brush-size>`
 */
export class PcBrushSize extends PcElement {
  static override properties = {
    ...PcElement.properties,
    settings: { attribute: false },
    label: { type: String },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: inline-flex;
        user-select: none;
        -webkit-user-select: none;
      }
      [role="slider"] {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 30px;
        padding: 0 var(--pc-space-2);
        border-radius: var(--pc-radius);
        color: var(--pc-text);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        cursor: ew-resize;
        touch-action: none;
      }
      [role="slider"]:hover {
        background: var(--pc-surface-hover);
      }
      [role="slider"]:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: -2px;
      }
    `,
  ];

  /** The brush or eraser settings it shows and changes */
  declare settings?: BrushSettings;

  /** Its name for screen readers, e.g. "Brush size" */
  declare label: string;

  private changes = new ChangeController(this, () => [this.settings]);

  private readonly drag = new PointerDrag((delta) =>
    this.settings?.resize(delta),
  );

  constructor() {
    super();
    this.label = "";
  }

  /**
   * Change the size with the arrow keys (a pixel) and Page Up and Page Down (a step).
   */
  private onKeyDown(event: KeyboardEvent): void {
    const settings = this.settings as BrushSettings;
    const actions: Record<string, () => void> = {
      ArrowUp: () => settings.resize(1),
      ArrowRight: () => settings.resize(1),
      ArrowDown: () => settings.resize(-1),
      ArrowLeft: () => settings.resize(-1),
      PageUp: () => settings.grow(),
      PageDown: () => settings.shrink(),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  override render() {
    const settings = this.settings;
    if (!settings) return nothing;
    const text = sizeText(settings);
    return html`<div
      part="control"
      role="slider"
      tabindex="0"
      aria-label=${this.label}
      aria-valuemin=${MIN_BRUSH_SIZE}
      aria-valuemax=${MAX_BRUSH_SIZE}
      aria-valuenow=${Math.max(settings.width, settings.height)}
      aria-valuetext=${text}
      title=${this.t("paintCanvas.brushMenu.dragToResize")}
      @pointerdown=${this.drag.start}
      @pointermove=${this.drag.move}
      @pointerup=${this.drag.end}
      @pointercancel=${this.drag.end}
      @keydown=${this.onKeyDown}
    >
      ${text}
    </div>`;
  }
}

defineElement("pc-brush-size", PcBrushSize);
