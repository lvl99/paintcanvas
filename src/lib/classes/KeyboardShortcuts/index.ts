import { Tool, type default as PaintCanvas } from "../PaintCanvas";
import {
  comboFromEvent,
  isTypingTarget,
  sameCombo,
  type ShortcutAction,
} from "../../utils/shortcuts";

/**
 * Whether a key press happened inside an open `<dialog>` (e.g. a settings window), where shortcuts must not apply and
 * Escape is left to close it.
 */
const inOpenDialog = (path: EventTarget[]): boolean =>
  path.some((target) => target instanceof HTMLDialogElement && target.open);

/** Event dispatched on the window for shortcut actions handled elsewhere (e.g. saving) */
export const SHORTCUT_EVENT = "pc-shortcut";

/**
 * Listens for key presses and runs the matching shortcut on the app, using the user's key combinations
 * (`app.shortcuts`). Shortcuts are ignored while typing in text fields and inside open `<dialog>` elements. Key presses are matched on keyboards with
 * different layouts (see `comboFromEvent`).
 *
 * Tool selection, brush/eraser size and opacity, interface visibility, select all/invert/deselect, undo/redo,
 * cut/copy/paste, deleting the masked image data (Delete or Backspace), fills, swapping colours, zooming, layer opacity
 * and finishing or cancelling a lasso shape are handled here; other actions (and Escape/Enter for later features)
 * dispatch an `pc-shortcut` event with the action as `detail`. Holding the hold-to-pan key (Space by default) pans
 * temporarily; releasing it returns to the selected tool.
 *
 * @example
 * const shortcuts = new KeyboardShortcuts(app);
 * shortcuts.attach(window);
 */
export default class KeyboardShortcuts {
  private readonly app: PaintCanvas;

  private target: EventTarget | null = null;

  /** The hold-to-pan key while it is held */
  private heldKey?: string;

  private readonly onKeyDown = (event: Event) =>
    this.handle(event as KeyboardEvent);

  private readonly onKeyUp = (event: Event) =>
    this.handleKeyUp(event as KeyboardEvent);

  // Releasing keys outside the window (e.g. switching apps) must not leave a tool held
  private readonly onBlur = () => this.release();

  constructor(app: PaintCanvas) {
    this.app = app;
  }

  /**
   * Start listening for key presses on a target (usually `window`).
   */
  attach(target: EventTarget): void {
    this.detach();
    this.target = target;
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  /**
   * Stop listening for key presses.
   */
  detach(): void {
    this.target?.removeEventListener("keydown", this.onKeyDown);
    this.target?.removeEventListener("keyup", this.onKeyUp);
    this.target?.removeEventListener("blur", this.onBlur);
    this.target = null;
  }

  /**
   * Run the shortcut for a key press, if any. Returns the action run.
   */
  handle(event: KeyboardEvent): ShortcutAction | undefined {
    // Events from inside shadow DOM are retargeted, so check the original target
    const path = event.composedPath();
    if (isTypingTarget(path[0] ?? event.target) || inOpenDialog(path))
      return undefined;
    const combo = comboFromEvent(event);
    if (!combo) return undefined;
    const { holdToPan, shortcuts } = this.app.shortcuts;
    if (holdToPan && sameCombo(combo, holdToPan)) {
      // Stops the page scrolling while Space is held
      event.preventDefault();
      this.heldKey = combo.key;
      this.app.holdTool(Tool.Pan);
      return undefined;
    }
    const action = shortcuts.find((shortcut) =>
      sameCombo(shortcut, combo),
    )?.action;
    if (!action) return undefined;
    event.preventDefault();
    this.run(action);
    return action;
  }

  /**
   * Return to the selected tool when the hold-to-pan key is released (whatever modifiers are held by then).
   */
  handleKeyUp(event: KeyboardEvent): void {
    if (
      this.heldKey !== undefined &&
      comboFromEvent(event)?.key === this.heldKey
    )
      this.release();
  }

  /** Stop holding the hold-to-pan key */
  private release(): void {
    this.heldKey = undefined;
    this.app.releaseHeldTool();
  }

  /**
   * Run a shortcut action.
   */
  run(action: ShortcutAction): void {
    const app = this.app;
    switch (action.type) {
      case "tool":
        app.selectTool(action.tool);
        break;
      case "brush-smaller":
        this.brushSettings()?.shrink();
        break;
      case "brush-bigger":
        this.brushSettings()?.grow();
        break;
      case "brush-less-opaque":
        this.brushSettings()?.lessOpaque();
        break;
      case "brush-more-opaque":
        this.brushSettings()?.moreOpaque();
        break;
      case "toggle-interface":
        app.toggleInterface();
        break;
      case "select-all":
        app.selection.selectAll();
        break;
      case "invert-selection":
        app.selection.invert();
        break;
      case "deselect":
        app.selection.clear();
        break;
      case "zoom-in":
        app.viewport.zoomIn(this.viewportCentre());
        break;
      case "zoom-out":
        app.viewport.zoomOut(this.viewportCentre());
        break;
      case "reset-zoom":
        app.viewport.zoomAt(this.viewportCentre(), 1);
        break;
      case "layer-opacity":
        app.layers.update(app.layers.active.id, { opacity: action.opacity });
        break;
      case "undo":
        app.undo();
        break;
      case "redo":
        app.redo();
        break;
      case "cut":
        app.cut();
        break;
      case "delete":
        app.deleteMasked();
        break;
      case "fill-foreground":
        app.fill("foreground");
        break;
      case "fill-background":
        app.fill("background");
        break;
      case "swap-colours":
        app.swapColours();
        break;
      case "copy":
        app.copy();
        break;
      case "paste":
        app.paste();
        break;
      case "commit":
        if (app.transform.pending) {
          app.commitTransform();
          break;
        }
        if (app.lasso.active) {
          app.applyLasso(app.lasso.close());
          break;
        }
        this.dispatch(action);
        break;
      case "cancel":
        app.lasso.cancel();
        app.cancelTransform();
        this.dispatch(action);
        break;
      default:
        this.dispatch(action);
    }
  }

  /** The brush or eraser settings while that tool is selected */
  private brushSettings() {
    const { app } = this;
    return app.tool === Tool.Eraser
      ? app.eraser
      : app.tool === Tool.Brush
        ? app.brush
        : undefined;
  }

  /** The middle of the viewport, which zoom shortcuts zoom around */
  private viewportCentre() {
    const { width, height } = this.app.viewport;
    return { x: width / 2, y: height / 2 };
  }

  /**
   * Dispatch an action as an `pc-shortcut` event for features handled elsewhere.
   */
  private dispatch(action: ShortcutAction): void {
    (this.target ?? this.app).dispatchEvent(
      new CustomEvent(SHORTCUT_EVENT, { detail: action }),
    );
  }
}
