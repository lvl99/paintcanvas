import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { PILLS_CSS as pill } from "../../styles";
import { WINDOWS_CSS as theme } from "../../styles";
import { NO_TEXT_SELECTION_CSS as noTextSelection } from "../../styles";
import { PcElement, defineElement } from "../../base";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import ChangeController from "../../ChangeController";
import { maskModeFor } from "../../../lib/selection/geometry";
import {
  LAYER_ALPHA_MASK_EVENT,
  LAYER_DRAG_EVENT,
  LAYER_MENU_OPEN_EVENT,
  type LayerAlphaMaskDetail,
  type LayerDragDetail,
  type LayerDropAction,
  type PcLayerItem,
} from "../PcLayerItem";
import "../PcLayerItem";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import type LayerStack from "../../../lib/classes/LayerStack";

/** A layer being dragged by its reorder handle, where its row floats, and where dropping it now would put it */
interface LayerDrag {
  id: string;
  name: string;
  action: LayerDropAction;
  /** Where it would land among the other layers (0 is the first row), when moving */
  slot?: number | undefined;
  /** The pointer, in the viewport */
  x: number;
  y: number;
  /** Where the pointer grabbed the row, from its top left, and the row's size, so the row floats as it was grabbed */
  offsetX: number;
  offsetY: number;
  width: number;
  /** The ghost is as tall as the row, so the list doesn't shift when the row lifts out */
  height: number;
}

/**
 * Whether a point is inside a rectangle (edges included).
 *
 * @example
 * isInside(element.getBoundingClientRect(), event.clientX, event.clientY);
 */
export const isInside = (rect: DOMRect, x: number, y: number): boolean =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/**
 * Where a dragged layer would land among the other rows: before the first row whose middle is below the pointer, or
 * after the last. The ghost showing the place is left out, so the place doesn't jump when the ghost moves.
 *
 * @param rows - the other rows' top and height, in list order
 * @param ghost - the ghost's top and height, if shown
 *
 * @example
 * dropSlot([{ top: 0, height: 30 }, { top: 30, height: 30 }], 40); // 1
 */
export const dropSlot = (
  rows: readonly { top: number; height: number }[],
  y: number,
  ghost?: { top: number; height: number },
): number => {
  const index = rows.findIndex((row) => {
    const below = ghost && row.top >= ghost.top ? ghost.height : 0;
    return y < row.top - below + row.height / 2;
  });
  return index < 0 ? rows.length : index;
};

/**
 * Layers menu: the user's layers from top to bottom and a "New Layer" button.
 *
 * Dragging a layer's reorder handle lifts its row out of the list to float with the pointer, and leaves a ghost with the
 * layer's name in the list where it would land: where it was, until it is moved somewhere else. Dropping it moves it
 * there, and dropping it on "New Layer" duplicates it (the cursor shows "+", and the button is
 * highlighted for touch). Escape cancels the drag. Moves and duplicates are announced to screen readers.
 *
 * @example
 * html`<pc-layers-menu .app=${app}></pc-layers-menu>`
 */
export class PcLayersMenu extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    drag: { state: true },
    announcement: { state: true },
  };

  static override styles = [
    PcElement.styles,

    unsafeCSS(noTextSelection),
    unsafeCSS(styles),
    unsafeCSS(theme),
    unsafeCSS(pill),
  ];

  declare app?: PaintCanvas;

  /** The layer being dragged, if any */
  declare drag?: LayerDrag | undefined;

  /** The last move or duplicate, for screen readers */
  declare announcement: string;

  private changes = new ChangeController(this, () => [
    this.app,
    this.app?.layers,
  ]);

  constructor() {
    super();
    this.announcement = "";
    this.addEventListener(LAYER_DRAG_EVENT, (event) =>
      this.onLayerDrag(
        (event as CustomEvent<LayerDragDetail>).detail,
        // The row that fired it (the event comes from inside this element's shadow DOM)
        event.composedPath()[0] as PcLayerItem,
      ),
    );
    // Only one layer's context menu is open at a time
    this.addEventListener(LAYER_MENU_OPEN_EVENT, (event) => {
      // The event comes from inside this element's shadow DOM, so use the original target
      const opened = event.composedPath()[0];
      for (const item of this.renderRoot.querySelectorAll<PcLayerItem>(
        "pc-layer-item",
      )) {
        if (item !== opened) item.menuOpen = false;
      }
    });
    // Cmd/Ctrl + click on a layer name masks that layer's pixels
    this.addEventListener(LAYER_ALPHA_MASK_EVENT, (event) => {
      const { layer, shiftKey, altKey } = (
        event as CustomEvent<LayerAlphaMaskDetail>
      ).detail;
      this.app?.selection.fromAlpha(layer, maskModeFor({ shiftKey, altKey }));
    });
  }

  /**
   * Follow a layer dragged by its reorder handle: show where it would land, then move or duplicate it when dropped.
   */
  private onLayerDrag(
    { layer, phase, x, y }: LayerDragDetail,
    row: PcLayerItem,
  ): void {
    if (phase === "start") {
      const rect = row.getBoundingClientRect();
      this.drag = {
        id: layer.id,
        name: layer.name,
        action: "none",
        x,
        y,
        offsetX: x - rect.left,
        offsetY: y - rect.top,
        width: rect.width,
        height: rect.height,
      };
    }
    const drag = this.drag;
    if (!drag) return;
    if (phase === "cancel") {
      this.drag = undefined;
      return;
    }
    this.drag = { ...drag, x, y, ...this.dropTarget(drag.id, x, y) };
    if (phase === "end") this.drop(this.drag);
  }

  /**
   * What dropping the dragged layer at a point would do: nothing outside the menu, duplicate it on "New Layer" (if
   * another layer can be made), otherwise move it to the place among the other rows nearest the pointer.
   */
  private dropTarget(
    id: string,
    x: number,
    y: number,
  ): Pick<LayerDrag, "action" | "slot"> {
    if (!isInside(this.getBoundingClientRect(), x, y))
      return { action: "none", slot: undefined };
    const root = this.renderRoot;
    const button = (
      root.querySelector("button.new") as HTMLElement
    ).getBoundingClientRect();
    if (isInside(button, x, y))
      return {
        action: this.app?.layers.canCreate ? "duplicate" : "none",
        slot: undefined,
      };
    const rows = [...root.querySelectorAll<PcLayerItem>("pc-layer-item")]
      .filter((item) => item.layer?.id !== id)
      .map((item) => item.getBoundingClientRect());
    const ghost = root.querySelector(".ghost")?.getBoundingClientRect();
    return { action: "move", slot: dropSlot(rows, y, ghost) };
  }

  /**
   * Move or duplicate the dropped layer, and tell screen readers what happened.
   */
  private drop(drag: LayerDrag): void {
    this.drag = undefined;
    const layers = this.app?.layers;
    if (!layers) return;
    if (drag.action === "duplicate") {
      layers.duplicate(drag.id);
      this.announcement = `${drag.name} duplicated`;
    } else if (drag.action === "move" && drag.slot !== undefined) {
      const from = layers.indexOf(drag.id);
      layers.move(drag.id, drag.slot);
      if (layers.indexOf(drag.id) !== from)
        this.announcement = `${drag.name} moved to position ${drag.slot + 1} of ${layers.layers.length}`;
    }
  }

  /**
   * The rows, with a ghost (the dragged layer's name) where it would land, counting only the other rows: where it was,
   * unless it would move. The dragged row floats with the pointer, out of the list. Rows are keyed by layer, so each
   * layer keeps its row (and a drag its handle) as the ghost moves.
   */
  private renderRows(layers: LayerStack) {
    const drag = this.drag;
    const slot = drag
      ? drag.action === "move"
        ? drag.slot
        : layers.indexOf(drag.id)
      : undefined;
    const ghost = {
      key: "ghost",
      view: html`<div
        class="ghost"
        aria-hidden="true"
        style=${styleMap({ height: `${drag?.height}px` })}
      >
        ${drag?.name}
      </div>`,
    };
    const entries: { key: string; view: unknown }[] = [];
    let others = 0;
    for (const layer of layers.layers) {
      const dragged = layer.id === drag?.id;
      if (!dragged && slot === others++) entries.push(ghost);
      entries.push({
        key: layer.id,
        view: html`<pc-layer-item
          .stack=${layers}
          .background=${this.app?.background}
          .layer=${layer}
          ?dragging=${dragged}
          .dropAction=${dragged ? drag?.action : undefined}
          style=${styleMap(
            dragged && drag
              ? {
                  left: `${drag.x - drag.offsetX}px`,
                  top: `${drag.y - drag.offsetY}px`,
                  width: `${drag.width}px`,
                }
              : {},
          )}
        ></pc-layer-item>`,
      });
    }
    if (slot === others) entries.push(ghost);
    return repeat(
      entries,
      (entry) => entry.key,
      (entry) => entry.view,
    );
  }

  override render() {
    const layers = this.app?.layers;
    if (!layers) return html``;
    return html`
      ${this.renderRows(layers)}
      <button
        type="button"
        class="pill new ${this.drag?.action === "duplicate" ? "drop-target" : ""}"
        ?disabled=${!layers.canCreate}
        @click=${() => layers.create()}
      >
        ${this.t("layers.new")}
      </button>
      <p class="announcement" role="status" aria-live="polite">
        ${this.announcement || nothing}
      </p>
    `;
  }
}

defineElement("pc-layers-menu", PcLayersMenu);
