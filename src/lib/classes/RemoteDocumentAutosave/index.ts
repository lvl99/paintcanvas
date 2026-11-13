import type { DocumentStoreLike } from "../../storage";
import type { DrawingDocument } from "../../document/schema";

/** How often changes are saved to the remote store, at most (milliseconds): every 5 minutes */
export const REMOTE_SAVE_INTERVAL_MS = 5 * 60 * 1000;

/** Event dispatched when saving fails (detail: the error) */
export const REMOTE_AUTOSAVE_ERROR_EVENT = "error";

/** How long the drawing must go unchanged before it's saved, in `idle` mode (milliseconds): 1 minute */
export const REMOTE_IDLE_MS = 60 * 1000;

/** Event the canvas dispatches when the drawing changes (`DOCUMENT_MODIFIED_EVENT` in `PaintCanvas`) */
const MODIFIED_EVENT = "modified";

/**
 * When changes are saved:
 * - `interval`: every `intervalMs` while there are changes not saved yet
 * - `idle`: once the drawing has gone unchanged for `idleMs`, and when the page is hidden or the window loses focus
 */
export type RemoteAutosaveMode = "interval" | "idle";

/** The canvas whose drawing is saved (`PaintCanvas`) */
export interface RemoteAutosaveCanvas extends EventTarget {
  /** The drawing as a document */
  createDocument(): Promise<DrawingDocument>;
}

/** Options for `RemoteDocumentAutosave` */
export interface RemoteAutosaveOptions {
  /** When changes are saved (default `interval`) */
  mode?: RemoteAutosaveMode;
  /** How often changes are saved, at most, in `interval` mode (default `REMOTE_SAVE_INTERVAL_MS`) */
  intervalMs?: number;
  /** How long the drawing must go unchanged before it's saved, in `idle` mode (default `REMOTE_IDLE_MS`) */
  idleMs?: number;
  /** Tells when the page is hidden, in `idle` mode (the page's document by default; none to skip) */
  document?: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  > | null;
  /** Tells when the window loses focus, in `idle` mode (the page's window by default; none to skip) */
  window?: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
}

/**
 * Keeps a canvas's drawing in a remote store (e.g. a user's account online), less often than the browser keeps it. In
 * `interval` mode (the default), changes are saved every `intervalMs` while there are some not saved yet. In `idle`
 * mode, they're saved once the drawing has gone unchanged for `idleMs`, and when the page is hidden or the window loses
 * focus. Either way, they're also saved when asked (`save`). Only changes to the drawing count (the canvas's `modified`
 * event). The whole document is saved each time, with a thumbnail.
 *
 * Dispatches `change` when saving starts, makes progress or ends, and `error` (detail: the error) when it fails (the
 * changes are tried again next time).
 *
 * @example
 * const autosave = new RemoteDocumentAutosave(canvas, myAccountStore, { mode: "idle" });
 * autosave.start();
 * saveButton.onclick = () => autosave.save();
 */
export default class RemoteDocumentAutosave extends EventTarget {
  /** Where the drawing is kept */
  readonly store: DocumentStoreLike;

  /** When changes are saved */
  readonly mode: RemoteAutosaveMode;

  /** The last saving error, until a save succeeds */
  error?: unknown;

  /** When the drawing was last saved, if it has been */
  lastSaved?: Date;

  /** How much of the save under way is done (0 to 1), if known */
  progress?: number;

  private readonly canvas: RemoteAutosaveCanvas;

  private readonly intervalMs: number;

  private readonly idleMs: number;

  private readonly page?: RemoteAutosaveOptions["document"];

  private readonly view?: RemoteAutosaveOptions["window"];

  /** Saves every `intervalMs` (interval mode) */
  private interval?: ReturnType<typeof setInterval>;

  /** Saves once the drawing goes unchanged (idle mode) */
  private idle?: ReturnType<typeof setTimeout>;

  private started = false;

  /** Whether there are changes not saved yet */
  private dirty = false;

  /** The save being written, if any */
  private current?: Promise<void>;

  // Remember there are changes to save, and in idle mode wait for the drawing to go unchanged again
  private readonly onModified = () => {
    this.dirty = true;
    if (this.mode !== "idle") return;
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.saveChanges(), this.idleMs);
  };

  // Save changes when the page is hidden
  private readonly onVisibilityChange = () => {
    if (this.page?.visibilityState === "hidden") this.saveChanges();
  };

  // Save changes when the window loses focus
  private readonly onBlur = () => this.saveChanges();

  constructor(
    canvas: RemoteAutosaveCanvas,
    store: DocumentStoreLike,
    options: RemoteAutosaveOptions = {},
  ) {
    super();
    this.canvas = canvas;
    this.store = store;
    this.mode = options.mode ?? "interval";
    this.intervalMs = options.intervalMs ?? REMOTE_SAVE_INTERVAL_MS;
    this.idleMs = options.idleMs ?? REMOTE_IDLE_MS;
    this.page =
      options.document === undefined ? globalThis.document : options.document;
    this.view =
      options.window === undefined ? globalThis.window : options.window;
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
   * Start saving changes (see `mode`).
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.canvas.addEventListener(MODIFIED_EVENT, this.onModified);
    if (this.mode === "interval") {
      this.interval = setInterval(() => this.saveChanges(), this.intervalMs);
      return;
    }
    this.page?.addEventListener("visibilitychange", this.onVisibilityChange);
    this.view?.addEventListener("blur", this.onBlur);
  }

  /**
   * Stop saving changes (a save under way finishes). Changes not saved yet aren't saved.
   */
  stop(): void {
    this.started = false;
    clearInterval(this.interval);
    clearTimeout(this.idle);
    this.interval = undefined;
    this.idle = undefined;
    this.canvas.removeEventListener(MODIFIED_EVENT, this.onModified);
    this.page?.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.view?.removeEventListener("blur", this.onBlur);
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
      // In idle mode, changes made while saving (or not saved) wait for the drawing to go unchanged again
      if (this.dirty && this.started && this.idle === undefined)
        this.onModified();
      this.notify();
    });
    this.notify();
    return this.current;
  }

  /** Save the drawing if there are changes not saved yet */
  private saveChanges(): void {
    clearTimeout(this.idle);
    this.idle = undefined;
    if (this.dirty) void this.save();
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
