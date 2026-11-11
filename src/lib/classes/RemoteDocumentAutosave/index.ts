import type { DocumentStoreLike } from "../../storage";
import type { DrawingDocument } from "../../document/schema";

/** How often changes are saved to the remote store, at most (milliseconds): every 5 minutes */
export const REMOTE_SAVE_INTERVAL_MS = 5 * 60 * 1000;

/** Event dispatched when saving fails (detail: the error) */
export const REMOTE_AUTOSAVE_ERROR_EVENT = "error";

/** The canvas whose drawing is saved (`PaintCanvas`) */
export interface RemoteAutosaveCanvas extends EventTarget {
  /** The user's layers (replaced when the canvas size changes, followed by a `change` event) */
  readonly layers: EventTarget;
  /** The drawing as a document */
  createDocument(): Promise<DrawingDocument>;
}

/** Options for `RemoteDocumentAutosave` */
export interface RemoteAutosaveOptions {
  /** How often changes are saved, at most (default `REMOTE_SAVE_INTERVAL_MS`) */
  intervalMs?: number;
}

/**
 * Keeps a canvas's drawing in a remote store (e.g. a user's account online), less often than the browser keeps it:
 * every `intervalMs` while there are changes not saved yet, or when asked (`save`). The whole document is saved each
 * time, with a thumbnail.
 *
 * Dispatches `change` when saving starts, makes progress or ends, and `error` (detail: the error) when it fails (the
 * changes are tried again next time).
 *
 * @example
 * const autosave = new RemoteDocumentAutosave(canvas, myAccountStore);
 * autosave.start();
 * saveButton.onclick = () => autosave.save();
 */
export default class RemoteDocumentAutosave extends EventTarget {
  /** Where the drawing is kept */
  readonly store: DocumentStoreLike;

  /** The last saving error, until a save succeeds */
  error?: unknown;

  /** When the drawing was last saved, if it has been */
  lastSaved?: Date;

  /** How much of the save under way is done (0 to 1), if known */
  progress?: number;

  private readonly canvas: RemoteAutosaveCanvas;

  private readonly intervalMs: number;

  private timer?: ReturnType<typeof setInterval>;

  /** The layers being watched for changes */
  private watched?: EventTarget;

  /** Whether there are changes not saved yet */
  private dirty = false;

  /** The save being written, if any */
  private current?: Promise<void>;

  // Remember there are changes to save
  private readonly onChange = () => {
    this.dirty = true;
  };

  // Follow the canvas's new layers when its size changes; the canvas's own changes include its details
  private readonly onCanvasChange = () => {
    this.dirty = true;
    if (this.canvas.layers === this.watched) return;
    this.watched?.removeEventListener("change", this.onChange);
    this.watched = this.canvas.layers;
    this.watched.addEventListener("change", this.onChange);
  };

  constructor(
    canvas: RemoteAutosaveCanvas,
    store: DocumentStoreLike,
    options: RemoteAutosaveOptions = {},
  ) {
    super();
    this.canvas = canvas;
    this.store = store;
    this.intervalMs = options.intervalMs ?? REMOTE_SAVE_INTERVAL_MS;
  }

  /** Whether a save is under way */
  get saving(): boolean {
    return this.current !== undefined;
  }

  /** Whether there are changes not saved yet */
  get hasChanges(): boolean {
    return this.dirty;
  }

  /**
   * Start saving changes every `intervalMs`.
   */
  start(): void {
    if (this.timer !== undefined) return;
    this.watched = this.canvas.layers;
    this.watched.addEventListener("change", this.onChange);
    this.canvas.addEventListener("change", this.onCanvasChange);
    this.timer = setInterval(() => {
      if (this.dirty) void this.save();
    }, this.intervalMs);
  }

  /**
   * Stop saving changes (a save under way finishes). Changes not saved yet aren't saved.
   */
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.watched?.removeEventListener("change", this.onChange);
    this.watched = undefined;
    this.canvas.removeEventListener("change", this.onCanvasChange);
  }

  /**
   * Save the drawing now (e.g. when the user asks). While a save is under way, that save is returned.
   */
  save(): Promise<void> {
    if (this.current) return this.current;
    // Changes made while saving are saved next time
    this.dirty = false;
    this.progress = undefined;
    this.current = this.write().finally(() => {
      this.current = undefined;
      this.progress = undefined;
      this.notify();
    });
    this.notify();
    return this.current;
  }

  /** Save the whole drawing */
  private async write(): Promise<void> {
    try {
      const document = await this.canvas.createDocument();
      await this.store.save(document, (done) => {
        this.progress = Math.min(1, Math.max(0, done));
        this.notify();
      });
      this.lastSaved = new Date();
      this.error = undefined;
    } catch (error) {
      this.dirty = true;
      this.error = error;
      this.dispatchEvent(
        new CustomEvent(REMOTE_AUTOSAVE_ERROR_EVENT, { detail: error }),
      );
    }
  }

  /** Tell listeners something changed */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
