import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { WINDOWS_CSS as theme } from "../../styles";
import { NO_TEXT_SELECTION_CSS as noTextSelection } from "../../styles";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import { BlendMode, type default as Layer } from "../../../lib/classes/Layer";
import type LayerStack from "../../../lib/classes/LayerStack";
import { drawCheckerboard, fitSize } from "../../../lib/rendering/checkerboard";
import "../PcDialog";
import "../PcContextMenu";
import { MENU_MARGIN, menuTop } from "../PcContextMenu";
import type { MenuItem } from "../PcMenu";
import { CANCEL_CHOICE, type DialogChoice } from "../PcDialog";
import type BackgroundWork from "../../../lib/classes/BackgroundWork";

/** Blend mode options shown in the layer's select input */
export const BLEND_MODE_OPTIONS: readonly {
  value: BlendMode;
  label: string;
}[] = [
  { value: BlendMode.Normal, label: "paintCanvas.blendMode.normal" },
  { value: BlendMode.Screen, label: "paintCanvas.blendMode.screen" },
  { value: BlendMode.Lighten, label: "paintCanvas.blendMode.lighten" },
  { value: BlendMode.Multiply, label: "paintCanvas.blendMode.multiply" },
  { value: BlendMode.Darken, label: "paintCanvas.blendMode.darken" },
  { value: BlendMode.Overlay, label: "paintCanvas.blendMode.overlay" },
];

/** Actions in the reorder handle's context menu */
export type LayerAction =
  | "mask"
  | "duplicate"
  | "merge"
  | "clear"
  | "delete"
  | "up"
  | "top"
  | "down"
  | "bottom";

/** Context menu options in display order, with the translation keys of their labels */
export const LAYER_ACTIONS: readonly { action: LayerAction; label: string }[] =
  [
    { action: "mask", label: "paintCanvas.layers.createMask" },
    { action: "duplicate", label: "paintCanvas.layers.duplicate" },
    { action: "merge", label: "paintCanvas.layers.mergeDown" },
    { action: "clear", label: "paintCanvas.layers.clear" },
    { action: "delete", label: "paintCanvas.layers.delete" },
    { action: "up", label: "paintCanvas.layers.moveUp" },
    { action: "top", label: "paintCanvas.layers.moveToTop" },
    { action: "down", label: "paintCanvas.layers.moveDown" },
    { action: "bottom", label: "paintCanvas.layers.moveToBottom" },
  ];

/** Context menu actions that ask first */
export type ConfirmedAction = "merge" | "clear" | "delete";

/**
 * What the user is asked before each confirmed action: the dialog's heading and message, and its choices (the first
 * does the action), as translation keys. The message is given the layer's `name`.
 */
export const CONFIRMATIONS: Readonly<
  Record<
    ConfirmedAction,
    { heading: string; message: string; choices: readonly DialogChoice[] }
  >
> = {
  merge: {
    heading: "paintCanvas.layers.mergeDownTitle",
    message: "paintCanvas.layers.mergeDownConfirm",
    choices: [
      { value: "merge", label: "paintCanvas.layers.mergeLayer" },
      {
        value: CANCEL_CHOICE,
        label: "paintCanvas.common.dismiss",
        variant: "dismiss",
      },
    ],
  },
  clear: {
    heading: "paintCanvas.layers.clearTitle",
    message: "paintCanvas.layers.clearConfirm",
    choices: [
      { value: "clear", label: "paintCanvas.common.clear" },
      {
        value: CANCEL_CHOICE,
        label: "paintCanvas.common.dismiss",
        variant: "dismiss",
      },
    ],
  },
  delete: {
    heading: "paintCanvas.layers.deleteTitle",
    message: "paintCanvas.layers.deleteConfirm",
    choices: [
      { value: "delete", label: "paintCanvas.common.delete" },
      {
        value: CANCEL_CHOICE,
        label: "paintCanvas.common.dismiss",
        variant: "dismiss",
      },
    ],
  },
};

/** Thumbnail size in CSS pixels */
export const THUMBNAIL_SIZE = 30;

/** Checkerboard square size in thumbnail pixels */
export const THUMBNAIL_CHECKER_SIZE = 5;

/** Event a row dispatches when it opens its context menu, so other rows close theirs */
export const LAYER_MENU_OPEN_EVENT = "pc-layer-menu-open";

/** Event a row dispatches to ask for a mask from the layer's alpha (Cmd/Ctrl + click on the thumbnail or name, or "Create mask") */
export const LAYER_ALPHA_MASK_EVENT = "pc-layer-alpha-mask";

/** Details of an alpha mask request */
export interface LayerAlphaMaskDetail {
  layer: Layer;
  shiftKey: boolean;
  altKey: boolean;
}

/** How far (CSS pixels) the pointer moves on the reorder handle before it drags the layer, rather than opening the menu */
export const DRAG_THRESHOLD = 4;

/** Event a row dispatches while its layer is dragged by its reorder handle (detail: {@link LayerDragDetail}) */
export const LAYER_DRAG_EVENT = "pc-layer-drag";

/** What the layer being dragged would do if dropped where the pointer is */
export type LayerDropAction = "move" | "duplicate" | "none";

/** Details of a drag of a layer by its reorder handle */
export interface LayerDragDetail {
  layer: Layer;
  /** The drag started, moved, ended (dropped) or was cancelled (Escape, or the browser cancelled the pointer) */
  phase: "start" | "move" | "end" | "cancel";
  /** The pointer's position in the viewport, in CSS pixels */
  x: number;
  y: number;
}

/** Where the layer actions menu goes and how close to the window's edges (see `pc-context-menu`) */
export { MENU_MARGIN, menuTop };

/**
 * One row in the layers menu: reorder handle, thumbnail and name (then opacity and blend mode under them), alpha lock (padlock) and visibility (eye) icons.
 * Dragging the handle (with mouse, pen or touch) reorders the layer: the row fires {@link LAYER_DRAG_EVENT} and the
 * layers menu shows where it will land. Clicking or tapping the handle, pressing Enter or Space on it, or right-clicking
 * it opens the layer's actions menu (which can also reorder it). Cmd/Ctrl + click on the thumbnail or name (or "Create
 * mask" in the menu) makes a mask from the layer's pixels. "Merge down…" asks first, then merges the layer into the one
 * under it (not offered for the bottom layer, or when either is hidden).
 *
 * @example
 * html`<pc-layer-item .stack=${stack} .layer=${layer}></pc-layer-item>`
 */
export class PcLayerItem extends PcElement {
  static override properties = {
    ...PcElement.properties,
    stack: { attribute: false },
    layer: { attribute: false },
    background: { attribute: false },
    menuOpen: { state: true },
    confirming: { state: true },
    dragging: { type: Boolean, reflect: true },
    dropAction: { attribute: "drop-action", reflect: true },
  };

  static override styles = [
    PcElement.styles,

    unsafeCSS(noTextSelection),
    unsafeCSS(styles),
    unsafeCSS(theme),
  ];

  declare stack?: LayerStack;

  declare layer?: Layer;

  /** Waits for pauses in drawing to redraw the thumbnail; without it, the thumbnail redraws straight away */
  declare background?: BackgroundWork;

  /** Whether the reorder handle's context menu is open */
  declare menuOpen: boolean;

  /** The action the user is being asked to confirm, if any */
  declare confirming?: ConfirmedAction;

  /** Whether this row's layer is being dragged (set by the layers menu; the row floats with the pointer) */
  declare dragging: boolean;

  /** While this row's layer is dragged: what dropping it now would do (set by the layers menu; shown by the cursor) */
  declare dropAction?: LayerDropAction | undefined;

  /** The pointer pressed on the reorder handle, where it was pressed, and whether it has started dragging */
  private press?: {
    pointerId: number;
    x: number;
    y: number;
    dragging: boolean;
  };

  /** Whether to ignore the next click on the handle (it ended a drag) */
  private suppressClick = false;

  private changes = new ChangeController(this, () => [this.stack]);

  /** Device pixels per CSS pixel (replaceable for tests) */
  pixelRatio = () => window.devicePixelRatio || 1;

  constructor() {
    super();
    this.menuOpen = false;
    this.dragging = false;
  }

  /**
   * Run a context menu action. Merging down, clearing and deleting ask for confirmation first (see `confirmed`).
   */
  runAction(action: LayerAction): void {
    const { stack, layer } = this;
    this.menuOpen = false;
    if (!stack || !layer || !this.canRun(action)) return;
    switch (action) {
      case "mask":
        this.requestMask(layer, { shiftKey: false, altKey: false });
        break;
      case "duplicate":
        stack.duplicate(layer.id);
        break;
      case "merge":
      case "clear":
      case "delete":
        this.confirming = action;
        break;
      case "up":
        stack.moveUp(layer.id);
        break;
      case "top":
        stack.moveToTop(layer.id);
        break;
      case "down":
        stack.moveDown(layer.id);
        break;
      case "bottom":
        stack.moveToBottom(layer.id);
        break;
    }
  }

  /**
   * Whether a context menu action can be done to the layer now: not merging down the bottom layer (or with a hidden
   * layer), deleting the only layer, moving a layer further up or down than it can go, or anything to a layer no longer
   * in the stack (e.g. just deleted).
   */
  canRun(action: LayerAction): boolean {
    const { stack, layer } = this;
    if (!stack || !layer || !stack.layers.includes(layer)) return false;
    const index = stack.indexOf(layer.id);
    const last = stack.layers.length - 1;
    switch (action) {
      case "merge":
        return stack.canMergeDown(layer.id);
      case "delete":
        return last > 0;
      case "up":
      case "top":
        return index > 0;
      case "down":
      case "bottom":
        return index < last;
      default:
        return true;
    }
  }

  /**
   * Do an action the user confirmed.
   */
  confirmed(action: ConfirmedAction): void {
    const { stack, layer } = this;
    this.confirming = undefined;
    if (!stack || !layer) return;
    if (action === "merge") stack.mergeDown(layer.id);
    else if (action === "clear") stack.clear(layer.id);
    else stack.remove(layer.id);
  }

  /**
   * Follow the context menu opening or closing, telling other rows when it opens (so they close theirs).
   */
  private onMenuToggle(event: CustomEvent<{ open: boolean }>): void {
    this.menuOpen = event.detail.open;
    if (!this.menuOpen) return;
    this.dispatchEvent(
      new CustomEvent(LAYER_MENU_OPEN_EVENT, { bubbles: true, composed: true }),
    );
  }

  /**
   * A click on the handle opens the menu, unless it ends a drag (then it's stopped before reaching the menu's button).
   */
  private readonly onHandleClick = {
    handleEvent: (event: Event) => {
      if (!this.suppressClick) return;
      this.suppressClick = false;
      event.stopPropagation();
    },
    capture: true,
  };

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.endPress();
  }

  /** Tell the layers menu about a drag of this row's layer */
  private emitDrag(phase: LayerDragDetail["phase"], x: number, y: number) {
    this.dispatchEvent(
      new CustomEvent<LayerDragDetail>(LAYER_DRAG_EVENT, {
        detail: { layer: this.layer as Layer, phase, x, y },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Press on the reorder handle: follow the pointer, which drags once it has moved far enough. The pointer is followed
   * on the whole window, as browsers don't always grant pointer capture; it is asked for too, so a touch keeps dragging
   * after leaving the handle.
   */
  private onHandlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.press = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    // Captured by the element pressed (the handle's button), so the click that follows still reaches it
    (event.composedPath()[0] as Element).setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", this.onHandlePointerMove);
    window.addEventListener("pointerup", this.onHandlePointerUp);
    window.addEventListener("pointercancel", this.onHandlePointerCancel);
  }

  /**
   * Start dragging once the pointer has moved {@link DRAG_THRESHOLD} pixels, then report where it is.
   */
  private readonly onHandlePointerMove = (event: PointerEvent): void => {
    const press = this.press;
    if (press?.pointerId !== event.pointerId) return;
    if (!press.dragging) {
      if (
        Math.hypot(event.clientX - press.x, event.clientY - press.y) <
        DRAG_THRESHOLD
      )
        return;
      press.dragging = true;
      window.addEventListener("keydown", this.onDragKeyDown);
      this.emitDrag("start", event.clientX, event.clientY);
    }
    this.emitDrag("move", event.clientX, event.clientY);
  };

  /**
   * Drop the layer where the pointer is, if it was dragged (a press without dragging opens the menu, on its click).
   */
  private readonly onHandlePointerUp = (event: PointerEvent): void => {
    if (this.press?.pointerId !== event.pointerId) return;
    if (this.press.dragging) {
      this.suppressClick = true;
      this.emitDrag("end", event.clientX, event.clientY);
    }
    this.endPress();
  };

  /**
   * Cancel a drag when the browser cancels the pointer (e.g. a system gesture).
   */
  private readonly onHandlePointerCancel = (event: PointerEvent): void => {
    if (this.press?.pointerId !== event.pointerId) return;
    if (this.press.dragging)
      this.emitDrag("cancel", event.clientX, event.clientY);
    this.endPress();
  };

  /** Escape cancels a drag, leaving the layer where it was */
  private readonly onDragKeyDown = (event: KeyboardEvent) => {
    const press = this.press;
    if (event.key !== "Escape" || !press) return;
    this.suppressClick = true;
    this.emitDrag("cancel", press.x, press.y);
    this.endPress();
  };

  /** Stop following the pointer pressed on the handle */
  private endPress(): void {
    this.press = undefined;
    window.removeEventListener("keydown", this.onDragKeyDown);
    window.removeEventListener("pointermove", this.onHandlePointerMove);
    window.removeEventListener("pointerup", this.onHandlePointerUp);
    window.removeEventListener("pointercancel", this.onHandlePointerCancel);
  }

  /**
   * Ask for a mask following the layer's alpha (Shift adds, Alt subtracts; otherwise it replaces the mask).
   */
  private requestMask(
    layer: Layer,
    keys: { shiftKey: boolean; altKey: boolean },
  ): void {
    this.dispatchEvent(
      new CustomEvent<LayerAlphaMaskDetail>(LAYER_ALPHA_MASK_EVENT, {
        detail: { layer, shiftKey: keys.shiftKey, altKey: keys.altKey },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Clicking the row selects the layer. Cmd/Ctrl + click on the thumbnail or name also makes a mask from the layer's alpha.
   */
  private onRowClick(event: MouseEvent, stack: LayerStack, layer: Layer): void {
    stack.select(layer.id);
    if (!event.metaKey && !event.ctrlKey) return;
    const target = event.composedPath()[0];
    if (!(target instanceof Element) || !target.matches(".thumbnail, .name"))
      return;
    event.preventDefault();
    this.requestMask(layer, event);
  }

  /**
   * Rename a layer when the name input changes. Empty names are reverted.
   */
  private onRename(event: Event, stack: LayerStack, layer: Layer): void {
    const input = event.target as HTMLInputElement;
    try {
      stack.rename(layer.id, input.value);
    } catch {
      input.value = layer.name;
    }
  }

  override updated(): void {
    const id = this.layer?.id;
    if (this.background && id)
      this.background.run(`thumbnail ${id}`, () => this.drawThumbnail());
    else this.drawThumbnail();
  }

  /**
   * Draw the layer's image, scaled to fit, on a checkerboard that shows transparency.
   */
  drawThumbnail(): void {
    const layer = this.layer;
    const canvas =
      this.renderRoot.querySelector<HTMLCanvasElement>("canvas.thumbnail");
    if (!layer || !canvas) return;
    const ratio = this.pixelRatio();
    const size = Math.round(THUMBNAIL_SIZE * ratio);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCheckerboard(ctx, size, size, THUMBNAIL_CHECKER_SIZE * ratio);
    const fitted = fitSize(layer.width, layer.height, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      layer.canvas,
      (size - fitted.width) / 2,
      (size - fitted.height) / 2,
      fitted.width,
      fitted.height,
    );
  }

  /** The dialog asking the user to confirm an action, while asking */
  private renderConfirmation(layer: Layer) {
    const action = this.confirming;
    if (!action) return nothing;
    const { heading, message, choices } = CONFIRMATIONS[action];
    return html`<pc-dialog
      heading=${this.t(heading)}
      message=${this.t(message, { name: layer.name })}
      .choices=${choices.map((choice) => ({
        ...choice,
        label: this.t(choice.label),
      }))}
      @pc-choose=${(e: CustomEvent<{ value: string }>) => {
        e.stopPropagation();
        if (e.detail.value === action) this.confirmed(action);
        else this.confirming = undefined;
      }}
    ></pc-dialog>`;
  }

  /** The layer's actions, for its context menu (those it can't do now are disabled) */
  private menuItems(): MenuItem[] {
    return LAYER_ACTIONS.map(({ action, label }) => ({
      value: action,
      label: this.t(label),
      disabled: !this.canRun(action),
    }));
  }

  override render() {
    const { stack, layer } = this;
    if (!stack || !layer) return html``;
    const active = stack.active.id === layer.id;
    return html`
      <pc-context-menu
        class="handle"
        placement="beside"
        label=${this.t("paintCanvas.layers.reorder", { name: layer.name })}
        menu-label=${this.t("paintCanvas.layers.actions")}
        .open=${this.menuOpen}
        .items=${this.menuItems()}
        @pc-toggle=${this.onMenuToggle}
        @pc-select=${(e: CustomEvent<{ value: LayerAction }>) =>
          this.runAction(e.detail.value)}
        @click=${this.onHandleClick}
        @pointerdown=${this.onHandlePointerDown}
        ><span slot="icon" aria-hidden="true">⠿</span></pc-context-menu
      >
      <div
        class="details"
        @click=${(e: MouseEvent) => this.onRowClick(e, stack, layer)}
      >
        <canvas class="thumbnail" aria-hidden="true"></canvas>
        <input
          class="name ${active ? "active" : ""}"
          aria-label=${this.t("paintCanvas.layers.name")}
          .value=${layer.name}
          @change=${(e: Event) => this.onRename(e, stack, layer)}
        />
        <input
          type="range"
          min="0"
          max="100"
          aria-label=${this.t("paintCanvas.common.opacity")}
          .value=${String(Math.round(layer.opacity * 100))}
          @change=${(e: Event) =>
            stack.update(layer.id, {
              opacity: Number((e.target as HTMLInputElement).value) / 100,
            })}
        />
        <select
          aria-label=${this.t("paintCanvas.layers.blendMode")}
          @change=${(e: Event) =>
            stack.update(layer.id, {
              blendMode: (e.target as HTMLSelectElement).value as BlendMode,
            })}
        >
          ${BLEND_MODE_OPTIONS.map(
            ({ value, label }) =>
              html`<option
                value=${value}
                ?selected=${layer.blendMode === value}
              >
                ${this.t(label)}
              </option>`,
          )}
        </select>
      </div>
      <button
        type="button"
        class="alpha-lock"
        aria-label=${this.t("paintCanvas.layers.alphaLock")}
        aria-pressed=${layer.alphaLock}
        @click=${() => stack.update(layer.id, { alphaLock: !layer.alphaLock })}
      >
        <img
          src=${this.iconUrl(layer.alphaLock ? "locked" : "unlocked")}
          alt=""
        />
      </button>
      <button
        type="button"
        class="visibility"
        aria-label=${this.t("paintCanvas.layers.visible")}
        aria-pressed=${layer.visible}
        @click=${() => stack.update(layer.id, { visible: !layer.visible })}
      >
        <img src=${this.iconUrl(layer.visible ? "visible" : "hidden")} alt="" />
      </button>
      ${this.renderConfirmation(layer)}
    `;
  }
}

defineElement("pc-layer-item", PcLayerItem);
