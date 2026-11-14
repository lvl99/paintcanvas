import {
  Tool,
  otherColourSlot,
  type default as PaintCanvas,
} from "../PaintCanvas";
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

/**
 * How long (milliseconds) the paste shortcut waits for the browser's `paste` event (which carries other apps' images)
 * before pasting the image data copied here
 */
export const PASTE_EVENT_WAIT_MS = 50;

/**
 * The first image in a paste's clipboard data (e.g. copied in another app), if any.
 *
 * @example
 * pastedImage(event.clipboardData); // File of type "image/png", or undefined
 */
export const pastedImage = (data: DataTransfer | null): File | undefined =>
  [...(data?.files ?? [])].find((file) => file.type.startsWith("image/"));

/** Event dispatched on the window for shortcut actions handled elsewhere (e.g. saving) */
export const SHORTCUT_EVENT = "pc-shortcut";

/**
 * Listens for key presses and runs the matching shortcut on the app, using the user's key combinations
 * (`app.shortcuts`). Shortcuts are ignored while typing in text fields and inside open `<dialog>` elements. Key presses are matched on keyboards with
 * different layouts (see `comboFromEvent`).
 *
 * Tool selection, brush/eraser size and opacity, interface visibility, select all/invert/deselect, undo/redo,
 * cut/copy/paste, deleting the masked image data (Delete or Backspace), fills, swapping colours, zooming, layer opacity
 * and finishing or cancelling a lasso shape are handled here. Pasting (the shortcut, or the browser's own paste, e.g. from
 * its Edit menu) pastes the image data copied here, unless the window has lost focus since it was copied and the
 * clipboard has an image (e.g. copied in another app): that image is pasted instead (see `PaintCanvas.pasteImage`).
 * Other actions other actions (and Escape/Enter for later features)
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

  /** Turns pasted image files into images (replaceable for tests) */
  private readonly decodeImage: (blob: Blob) => Promise<ImageBitmap>;

  /** `app.copyCount` when the window last lost focus: copies since then were made here */
  private copiesBeforeBlur = 0;

  /** Pastes the image data copied here if the browser doesn't fire `paste` soon after the shortcut */
  private pasteTimer?: ReturnType<typeof setTimeout>;

  // Releasing keys outside the window (e.g. switching apps) must not leave a tool held. Something may be copied
  // elsewhere while away.
  private readonly onBlur = () => {
    this.release();
    this.copiesBeforeBlur = this.app.copyCount;
  };

  private readonly onPaste = (event: Event) =>
    void this.handlePaste(event as ClipboardEvent);

  constructor(
    app: PaintCanvas,
    decodeImage: (blob: Blob) => Promise<ImageBitmap> = (blob) =>
      createImageBitmap(blob),
  ) {
    this.app = app;
    this.decodeImage = decodeImage;
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
    target.addEventListener("paste", this.onPaste);
  }

  /**
   * Stop listening for key presses.
   */
  detach(): void {
    this.target?.removeEventListener("keydown", this.onKeyDown);
    this.target?.removeEventListener("keyup", this.onKeyUp);
    this.target?.removeEventListener("blur", this.onBlur);
    this.target?.removeEventListener("paste", this.onPaste);
    this.target = null;
    this.cancelPasteTimer();
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
    if (action.type === "paste") {
      // Let the browser fire `paste`, which carries other apps' images; paste what was copied here if it doesn't
      this.cancelPasteTimer();
      this.pasteTimer = setTimeout(() => {
        this.pasteTimer = undefined;
        this.app.paste();
      }, PASTE_EVENT_WAIT_MS);
      return action;
    }
    event.preventDefault();
    this.run(action);
    return action;
  }

  /**
   * Paste from the browser's `paste` event: the image data copied here if it was copied since the window last lost
   * focus (or the clipboard has no image), otherwise the clipboard's image. Ignored in text fields and open dialogs.
   */
  async handlePaste(event: ClipboardEvent): Promise<void> {
    const path = event.composedPath();
    if (isTypingTarget(path[0] ?? event.target) || inOpenDialog(path)) return;
    this.cancelPasteTimer();
    event.preventDefault();
    const app = this.app;
    const image = pastedImage(event.clipboardData);
    const copiedHere = app.copyCount > this.copiesBeforeBlur;
    if (!image || (copiedHere && app.hasClipboard)) {
      app.paste();
      return;
    }
    try {
      app.pasteImage(await this.decodeImage(image));
    } catch {
      // An image the browser can't read: nothing to paste
    }
  }

  /** Stop waiting for the browser's `paste` event */
  private cancelPasteTimer(): void {
    clearTimeout(this.pasteTimer);
    this.pasteTimer = undefined;
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
        app.fill(app.selectedColour);
        break;
      case "fill-background":
        app.fill(otherColourSlot(app.selectedColour));
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
