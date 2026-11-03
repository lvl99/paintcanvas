import type LayerStack from "../LayerStack";
import type BackgroundWork from "../BackgroundWork";
import { pixelFingerprint } from "../../image";
import {
  SAVED_DRAWING_VERSION,
  type LayerStoreLike,
  type SavedDrawing,
  type SavedDrawingWithImages,
  type SavedLayer,
} from "../../storage";

/** How long to wait after the layers change before saving, so quick changes are saved together (milliseconds) */
export const SAVE_DELAY_MS = 500;

/** Name of the save in the canvas's background work */
export const SAVE_WORK = "save";

/** Event dispatched when loading or saving fails (detail: the error) */
export const AUTOSAVE_ERROR_EVENT = "error";

/** Where autosaving is up to */
export const AutosaveState = {
  /** Waiting to draw (another window may have the drawing) or loading the saved drawing */
  Starting: "starting",
  /** Another window has the drawing; this one doesn't save (see `takeOver`) */
  Elsewhere: "elsewhere",
  /** The saved drawing is shown, and changes are saved */
  Ready: "ready",
  /** Not saving any more (see `stop`) */
  Stopped: "stopped",
} as const;

export type AutosaveState = (typeof AutosaveState)[keyof typeof AutosaveState];

/** The canvas whose layers are saved (`PaintCanvas`) */
export interface AutosaveCanvas extends EventTarget {
  /** The user's layers (replaced when the canvas size changes, followed by a `change` event) */
  readonly layers: LayerStack;
  /** Slow work that waits for pauses in drawing */
  readonly background: BackgroundWork;
  /** Replace the canvas size and layers with saved ones, drawing each layer's image, and select one */
  restoreLayers(
    width: number,
    height: number,
    layers: readonly SavedLayer[],
    images: readonly CanvasImageSource[],
    activeLayer: string,
  ): void;
}

/** Options for `LayerAutosave` */
export interface AutosaveOptions {
  /** Makes sure only one window draws on a drawing (the browser's Web Locks by default; none to skip) */
  locks?: LockManager | null;
  /** Tells when the page is hidden or shown again (the page's document by default) */
  document?: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  > | null;
  /** Turns a layer's canvas into a PNG (replaceable for tests) */
  encode?: (canvas: OffscreenCanvas) => Promise<Blob>;
  /** Turns a saved PNG into an image to draw (replaceable for tests) */
  decode?: (image: Blob) => Promise<CanvasImageSource>;
  /** How long to wait after the layers change before saving (default `SAVE_DELAY_MS`) */
  delayMs?: number;
}

/**
 * Encode a canvas as a PNG.
 */
const encodePng = (canvas: OffscreenCanvas): Promise<Blob> => {
  // A canvas that was never drawn on has no context yet, and can't be encoded without one
  canvas.getContext("2d");
  return canvas.convertToBlob({ type: "image/png" });
};

/**
 * Whether a saved drawing has the expected shape and an image for each layer.
 */
const isComplete = (
  drawing: SavedDrawing,
  images: ReadonlyMap<string, Blob>,
): boolean =>
  drawing.version === SAVED_DRAWING_VERSION &&
  drawing.layers.length > 0 &&
  drawing.layers.every((layer) => images.has(layer.id)) &&
  drawing.layers.some((layer) => layer.id === drawing.activeLayer);

/**
 * Keeps a canvas's layers in a store, so the drawing survives reloading the page: restores the saved drawing when it
 * starts, then saves soon after the layers change (once drawing pauses), and straight away when the page is hidden.
 * Only layers whose pixels changed are encoded and saved again; a quick fingerprint of each layer's pixels tells
 * which.
 *
 * Only one window draws on a drawing at a time: the first to start has it, and others wait in the `elsewhere` state
 * (the UI blocks drawing there). When the page is shown again it tries again, and `takeOver` takes the drawing from
 * the other window, which then waits instead. Without Web Locks, every window draws.
 *
 * If the saved drawing can't be loaded or restored, autosaving stops (`stopped`) so the drawing isn't saved over; clear
 * the store to start again. Dispatches `change` when its state or `storedBytes` changes, and `error` (detail: the
 * error) when loading or saving fails. Undo history isn't saved.
 *
 * @example
 * const autosave = new LayerAutosave(canvas, new IndexedDbLayerStore("my-drawing"));
 * autosave.start();
 * autosave.addEventListener("change", () => (blocked.hidden = autosave.state !== AutosaveState.Elsewhere));
 */
export default class LayerAutosave extends EventTarget {
  /** Where the layers are kept */
  readonly store: LayerStoreLike;

  /** The last loading or saving error, until a save succeeds */
  error?: unknown;

  private currentState: AutosaveState = AutosaveState.Starting;

  private readonly canvas: AutosaveCanvas;

  private readonly locks: LockManager | null;

  private readonly document: AutosaveOptions["document"];

  private readonly encode: (canvas: OffscreenCanvas) => Promise<Blob>;

  private readonly decode: (image: Blob) => Promise<CanvasImageSource>;

  private readonly delayMs: number;

  /** The layers being watched for changes */
  private watched?: LayerStack;

  /** Fingerprints of each layer's pixels as last saved, by layer ID */
  private prints = new Map<string, number>();

  /** Size in bytes of each layer's image as last saved or restored, by layer ID */
  private sizes = new Map<string, number>();

  /** Layers whose pixels changed since the last save */
  private changed = new Set<string>();

  /** Whether any layer may have changed since the last save (not only those in `changed`) */
  private checkAll = false;

  private timer?: ReturnType<typeof setTimeout>;

  /** The save being written, if any */
  private saving?: Promise<void>;

  /** Whether to save again once the current save finishes */
  private again = false;

  /** Lets go of the drawing's lock, while held */
  private release?: () => void;

  // Note which layer changed (when only one layer's pixels did), and save soon
  private readonly onLayersChange = () => {
    const id = this.watched?.changedLayerId;
    if (id) this.changed.add(id);
    else this.checkAll = true;
    this.schedule();
  };

  // Follow the canvas's new layers when its size changes
  private readonly onCanvasChange = () => {
    if (this.canvas.layers === this.watched) return;
    this.watch();
    this.onLayersChange();
  };

  // Save before the page is hidden (it may be closing); try to draw again when it's shown
  private readonly onVisibilityChange = (event: Event) => {
    if ((event.target as Document).visibilityState === "hidden")
      void this.save();
    else if (this.currentState === AutosaveState.Elsewhere) this.claim(false);
  };

  constructor(
    canvas: AutosaveCanvas,
    store: LayerStoreLike,
    options: AutosaveOptions = {},
  ) {
    super();
    this.canvas = canvas;
    this.store = store;
    this.locks =
      options.locks === undefined
        ? (globalThis.navigator?.locks ?? null)
        : options.locks;
    this.document =
      options.document === undefined
        ? (globalThis.document ?? null)
        : options.document;
    this.encode = options.encode ?? encodePng;
    this.decode = options.decode ?? ((image) => createImageBitmap(image));
    this.delayMs = options.delayMs ?? SAVE_DELAY_MS;
  }

  /** Where autosaving is up to (see `AutosaveState`) */
  get state(): AutosaveState {
    return this.currentState;
  }

  /** Total size in bytes of the layer images kept in the store (as last saved or restored) */
  get storedBytes(): number {
    let total = 0;
    for (const size of this.sizes.values()) total += size;
    return total;
  }

  /** Name of the Web Lock that only one window holds per drawing */
  get lockName(): string {
    return `paintcanvas:${this.store.name}`;
  }

  /**
   * Start: wait for the drawing (unless another window has it), restore it, then save changes.
   */
  start(): void {
    this.document?.addEventListener(
      "visibilitychange",
      this.onVisibilityChange,
    );
    this.claim(false);
  }

  /**
   * Take the drawing from the window that has it: that window stops saving, and this one restores the drawing as last
   * saved and saves its changes. Does nothing unless another window has it.
   */
  takeOver(): void {
    if (this.currentState === AutosaveState.Elsewhere) this.claim(true);
  }

  /**
   * Stop saving and let other windows have the drawing, after saving any changes not saved yet.
   */
  async stop(): Promise<void> {
    if (this.currentState === AutosaveState.Stopped) return;
    this.document?.removeEventListener(
      "visibilitychange",
      this.onVisibilityChange,
    );
    await this.save();
    this.unwatch();
    this.setState(AutosaveState.Stopped);
    this.letGo();
  }

  /**
   * Save the changes not saved yet now, without waiting. While a save is being written, another follows it.
   */
  save(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.currentState !== AutosaveState.Ready) return Promise.resolve();
    if (this.saving) {
      this.again = true;
      return this.saving;
    }
    this.saving = this.write().finally(() => {
      this.saving = undefined;
      if (!this.again) return;
      this.again = false;
      void this.save();
    });
    return this.saving;
  }

  /**
   * Ask for the drawing's lock, if there are locks: only if no other window has it, or taking it from the one that
   * does. Without locks, start straight away.
   */
  private claim(steal: boolean): void {
    if (!this.locks) {
      void this.begin();
      return;
    }
    this.locks
      .request(
        this.lockName,
        steal ? { steal: true } : { ifAvailable: true },
        (lock) => {
          if (this.currentState === AutosaveState.Stopped) return undefined;
          if (!lock) {
            this.setState(AutosaveState.Elsewhere);
            return undefined;
          }
          // Hold the lock until letting go
          return new Promise<void>((release) => {
            this.release = release;
            void this.begin();
          });
        },
      )
      .catch((error: unknown) => {
        // Another window took the drawing over
        if ((error as Error | undefined)?.name === "AbortError")
          this.lostLock();
        // Locks can't be used here (e.g. a sandboxed page): draw without one
        else void this.begin();
      });
  }

  /**
   * Restore the saved drawing (if any), then watch for changes; with nothing saved, the current drawing is saved. If
   * the saved drawing can't be loaded or restored (e.g. it's from another version, or an image can't be decoded),
   * autosaving stops instead, so it isn't saved over.
   */
  private async begin(): Promise<void> {
    if (this.currentState === AutosaveState.Stopped) return;
    this.setState(AutosaveState.Starting);
    let restored: boolean;
    try {
      const saved = await this.store.load();
      restored = saved !== undefined && (await this.restore(saved));
    } catch (error) {
      this.fail(error);
      void this.stop();
      return;
    }
    if (this.currentState !== AutosaveState.Starting) return;
    this.prints = new Map();
    this.watch();
    if (restored) this.remember();
    this.setState(AutosaveState.Ready);
    if (!restored) this.onLayersChange();
  }

  /**
   * Draw a saved drawing onto the canvas. Returns false if autosaving stopped or another window took the drawing
   * meanwhile. Throws if the drawing is incomplete or from another version, or the canvas can't take it.
   */
  private async restore({
    drawing,
    images,
  }: SavedDrawingWithImages): Promise<boolean> {
    if (!isComplete(drawing, images))
      throw new Error(
        "The saved drawing is incomplete or from another version",
      );
    const decoded = await Promise.all(
      drawing.layers.map((layer) => this.decode(images.get(layer.id) as Blob)),
    );
    if (this.currentState !== AutosaveState.Starting) return false;
    // Not saved again for being restored
    this.unwatch();
    this.canvas.restoreLayers(
      drawing.width,
      drawing.height,
      drawing.layers,
      decoded,
      drawing.activeLayer,
    );
    this.sizes = new Map(
      drawing.layers.map((layer) => [
        layer.id,
        (images.get(layer.id) as Blob).size,
      ]),
    );
    return true;
  }

  /**
   * Remember each layer's pixels as saved (just restored).
   */
  private remember(): void {
    for (const layer of this.canvas.layers.layers)
      this.prints.set(layer.id, this.fingerprint(layer.id));
    this.changed.clear();
    this.checkAll = false;
  }

  /**
   * Save the drawing, encoding only the layers whose pixels changed since they were last saved.
   */
  private async write(): Promise<void> {
    const stack = this.canvas.layers;
    const { checkAll, changed } = this;
    this.checkAll = false;
    this.changed = new Set();
    const prints = new Map<string, number>();
    try {
      const encoding: Promise<readonly [string, Blob]>[] = [];
      for (const layer of stack.layers) {
        const unsaved = !this.prints.has(layer.id);
        if (!unsaved && !checkAll && !changed.has(layer.id)) continue;
        const print = this.fingerprint(layer.id);
        if (print === this.prints.get(layer.id)) continue;
        prints.set(layer.id, print);
        // Encoding starts now, so it has the pixels just fingerprinted
        encoding.push(
          this.encode(layer.canvas).then((image) => [layer.id, image] as const),
        );
      }
      const drawing: SavedDrawing = {
        version: SAVED_DRAWING_VERSION,
        width: stack.width,
        height: stack.height,
        layers: stack.layers.map((layer) => layer.toConfig()),
        activeLayer: stack.active.id,
      };
      const images = new Map(await Promise.all(encoding));
      // Another window may have taken the drawing over meanwhile
      if (this.currentState !== AutosaveState.Ready) return;
      await this.store.save(drawing, images);
      const kept = new Set(drawing.layers.map((layer) => layer.id));
      for (const id of this.prints.keys())
        if (!kept.has(id)) this.prints.delete(id);
      for (const [id, print] of prints) this.prints.set(id, print);
      this.error = undefined;
      this.rememberSizes(kept, images);
    } catch (error) {
      // Check the same layers again with the next save
      for (const id of [...changed, ...prints.keys()]) this.changed.add(id);
      this.checkAll ||= checkAll;
      this.fail(error);
    }
  }

  /**
   * Remember the sizes of the layer images just saved, forgetting layers that are gone, and tell listeners if the total
   * changed.
   */
  private rememberSizes(
    kept: ReadonlySet<string>,
    images: ReadonlyMap<string, Blob>,
  ): void {
    const before = this.storedBytes;
    for (const id of this.sizes.keys())
      if (!kept.has(id)) this.sizes.delete(id);
    for (const [id, image] of images) this.sizes.set(id, image.size);
    if (this.storedBytes !== before) this.dispatchEvent(new Event("change"));
  }

  /**
   * A fingerprint of a layer's pixels.
   */
  private fingerprint(id: string): number {
    const layer = this.canvas.layers.get(id);
    return pixelFingerprint(
      layer.context.getImageData(0, 0, layer.width, layer.height).data,
    );
  }

  /**
   * Save once the layers have stopped changing for a moment and drawing pauses.
   */
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.canvas.background.run(SAVE_WORK, () => void this.save()),
      this.delayMs,
    );
  }

  /**
   * Watch the canvas and its current layers for changes.
   */
  private watch(): void {
    this.unwatch();
    this.watched = this.canvas.layers;
    this.watched.addEventListener("change", this.onLayersChange);
    this.canvas.addEventListener("change", this.onCanvasChange);
  }

  /**
   * Stop watching for changes, forgetting a save that hasn't started.
   */
  private unwatch(): void {
    this.watched?.removeEventListener("change", this.onLayersChange);
    this.watched = undefined;
    this.canvas.removeEventListener("change", this.onCanvasChange);
    clearTimeout(this.timer);
    this.timer = undefined;
    this.canvas.background.cancel(SAVE_WORK);
  }

  /**
   * Another window took the drawing: stop saving and wait.
   */
  private lostLock(): void {
    this.release = undefined;
    this.unwatch();
    this.setState(AutosaveState.Elsewhere);
  }

  /**
   * Let other windows have the drawing.
   */
  private letGo(): void {
    this.release?.();
    this.release = undefined;
  }

  /**
   * Remember an error and tell listeners.
   */
  private fail(error: unknown): void {
    this.error = error;
    this.dispatchEvent(
      new CustomEvent(AUTOSAVE_ERROR_EVENT, { detail: error }),
    );
  }

  /**
   * Change state and tell listeners.
   */
  private setState(state: AutosaveState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.dispatchEvent(new Event("change"));
  }
}
