import { Tool, type default as PaintCanvas } from "../PaintCanvas";
import {
  HOLD_TO_PAN_KEY,
  isTypingTarget,
  matchShortcut,
  type ShortcutAction,
} from "../../utils/shortcuts";

/** Event dispatched on the window for shortcut actions handled elsewhere (e.g. saving) */
export const SHORTCUT_EVENT = "pc-shortcut";

/**
 * Listens for key presses and runs the matching shortcut on the app. Shortcuts are ignored while typing in text fields.
 *
 * Tool selection, brush/eraser size, interface visibility, select all/deselect, undo/redo, cut/copy/paste, deleting the
 * masked image data (Delete or Backspace), fills, swapping colours and finishing or cancelling a
 * lasso shape are handled here; other actions (and Escape/Enter for later features) dispatch an `pc-shortcut` event with the action as `detail`.
 * Holding Space pans temporarily; releasing it returns to the selected tool.
 *
 * @example
 * const shortcuts = new KeyboardShortcuts(app);
 * shortcuts.attach(window);
 */
export default class KeyboardShortcuts {
  private readonly app: PaintCanvas;

  private target: EventTarget | null = null;

  private readonly onKeyDown = (event: Event) =>
    this.handle(event as KeyboardEvent);

  private readonly onKeyUp = (event: Event) =>
    this.handleKeyUp(event as KeyboardEvent);

  // Releasing keys outside the window (e.g. switching apps) must not leave a tool held
  private readonly onBlur = () => this.app.releaseHeldTool();

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
    if (isTypingTarget(event.composedPath()[0] ?? event.target))
      return undefined;

    if (
      event.key === HOLD_TO_PAN_KEY &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      // Stops the page scrolling while Space is held
      event.preventDefault();
      this.app.holdTool(Tool.Pan);
      return undefined;
    }

    const action = matchShortcut(event);
    if (!action) return undefined;
    event.preventDefault();
    this.run(action);
    return action;
  }

  /**
   * Return to the selected tool when the hold-to-pan key is released.
   */
  handleKeyUp(event: KeyboardEvent): void {
    if (event.key === HOLD_TO_PAN_KEY) this.app.releaseHeldTool();
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
      case "brush-bigger": {
        const settings =
          app.tool === Tool.Eraser
            ? app.eraser
            : app.tool === Tool.Brush
              ? app.brush
              : undefined;
        if (action.type === "brush-bigger") settings?.grow();
        else settings?.shrink();
        break;
      }
      case "toggle-interface":
        app.toggleInterface();
        break;
      case "select-all":
        app.selection.selectAll();
        break;
      case "deselect":
        app.selection.clear();
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

  /**
   * Dispatch an action as an `pc-shortcut` event for features handled elsewhere.
   */
  private dispatch(action: ShortcutAction): void {
    (this.target ?? this.app).dispatchEvent(
      new CustomEvent(SHORTCUT_EVENT, { detail: action }),
    );
  }
}
