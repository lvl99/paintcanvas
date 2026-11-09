import StrokeLog from "../StrokeLog";
import { Tool } from "./tool";
import { isHexColour } from "../../utils/colour";
import BackgroundWork from "../BackgroundWork";
import type { DrawableLayer } from "../../rendering/compositing";
import BrushSettings from "../BrushSettings";
import LayerStack, { DEFAULT_MAX_LAYERS } from "../LayerStack";
import type History from "../History";
import Viewport, { type Point, type Rect } from "../Viewport";
import StrokeEngine, {
  BEFORE_COMMIT_EVENT,
  STROKE_BEGIN_EVENT,
  STROKE_END_EVENT,
  type StrokeCommitDetail,
} from "../../brushes/StrokeEngine";
import BrushTipCache from "../../brushes/BrushTipCache";
import Selection from "../../selection/Selection";
import Lasso, { type LassoResult } from "../../selection/Lasso";
import Transformer, {
  applyMask,
  contentBounds,
  copyArea,
  drawTransformed,
} from "../../transform/Transformer";
import { boxBounds } from "../../transform/geometry";
import Layer, {
  createOffscreenCanvas,
  type BlendMode,
  type CanvasFactory,
  type LayerConfig,
} from "../Layer";
import LayerAutosave, { type AutosaveOptions } from "../LayerAutosave";
import type { LayerStoreLike } from "../../storage";
import { brushPresets, eraserPresets } from "../../brushes";
import type { AssetAuthor, BrushConfig } from "../../brushes/types";
import {
  BUILT_IN_AUTHOR,
  UNKNOWN_AUTHOR,
  authorHandle,
} from "../../brushes/authors";
import { BRUSH_PRESET_FILE_FORMAT } from "../../presets";
import CustomPresets, { type PresetStoreLike } from "../CustomPresets";
import InputSettings from "../InputSettings";
import UiSettings from "../UiSettings";
import Palette from "../Palette";
import ShortcutSettings from "../ShortcutSettings";
import { PALETTE_FILE_FORMAT } from "../../palette";
import { SETTINGS_FILE_FORMAT } from "../../settings/schema";
import ExternalSheets from "../ExternalSheets";
import PatchSender from "../../messages/PatchSender";
import {
  CanvasMessageType,
  createPatchMessage,
  PROTOCOL_VERSION,
  validateCanvasMessage,
  type CanvasMessage,
  type PatchMessage,
  type StrokeMessage,
} from "../../messages";
import { REDO_EVENT, UNDO_EVENT, type HistoryStepDetail } from "../History";
import {
  base64ToBytes,
  boundingBoxSize,
  bytesToBase64,
  decodeRgbaDeflate,
  encodeRgbaDeflate,
  ImageEncoding,
  type BoundingBox,
} from "../../image";
import { drawLayers } from "../../rendering/compositing";
import {
  DOCUMENT_FORMAT,
  DOCUMENT_VERSION,
  isValidDocument,
  type PaintCanvasDocument,
} from "../../document";
import {
  SAMPLE_PIXELS,
  averageColour,
  flattenArea,
  pixelRect,
  readPixels,
  type PixelRect,
} from "../../rendering/sample";

export { Tool };

/** How the colour sample tool samples: the pixel under the pointer, or the average of a dragged rectangle */
export type SampleMode = "point" | "area";

/** Toggleable panels */
export enum Panel {
  Brush = "brush",
  Eraser = "eraser",
  Layers = "layers",
  /** The implementer's own app menu */
  Menu = "menu",
  /** The colour palette: the foreground and background colours, their values and the saved colours */
  Palette = "palette",
}

/** Panels opened by tools */
export const TOOL_PANELS: Partial<Record<Tool, Panel>> = {
  [Tool.Brush]: Panel.Brush,
  [Tool.Eraser]: Panel.Eraser,
};

/** Canvas width and height when none is given */
export const DEFAULT_CANVAS_SIZE = 2000;

/** Largest canvas width or height allowed when the `maxCanvasSize` option isn't given */
export const MAX_CANVAS_SIZE = 2000;

/** Foreground colour to start with */
export const DEFAULT_COLOUR = "#000000";

/** Background colour to start with */
export const DEFAULT_BACKGROUND_COLOUR = "#ffffff";

/**
 * One of the two colours: the foreground colour (painted by the brush and foreground fills) or the background colour
 * (painted by the eraser and Delete when the layer's alpha lock is on, and by background fills).
 */
export type ColourSlot = "foreground" | "background";

/** Owner of the custom presets when the `ownerId` option isn't given */
export const DEFAULT_OWNER_ID = "local";

/** Author name of presets made with `newPreset` when the `presetAuthor` option isn't given */
export const DEFAULT_AUTHOR = UNKNOWN_AUTHOR;

/** Names the implementer can change: what users see and what files are called */
export interface PaintCanvasNames {
  /** The app's name, e.g. the heading of the brush presets that come with it */
  app: string;
  /** Start of the names of saved files, e.g. screenshots and exported presets */
  filePrefix: string;
  /** The `format` written in exported brush preset files */
  presetFileFormat: string;
  /** The `format` written in exported colour palette files */
  paletteFileFormat: string;
  /** The `format` written in exported settings files */
  settingsFileFormat: string;
  /** Author name of presets made by a user without a handle, e.g. from `presetAuthor` */
  unknownAuthor: string;
}

/** PaintCanvas's own names */
export const DEFAULT_NAMES: Readonly<PaintCanvasNames> = {
  app: BUILT_IN_AUTHOR,
  filePrefix: "paintcanvas",
  presetFileFormat: BRUSH_PRESET_FILE_FORMAT,
  paletteFileFormat: PALETTE_FILE_FORMAT,
  settingsFileFormat: SETTINGS_FILE_FORMAT,
  unknownAuthor: UNKNOWN_AUTHOR,
};

export { isHexColour };

/** How much the canvas holds, e.g. to show in a stats panel */
export interface CanvasStats {
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** Number of the user's layers */
  layers: number;
  /** Number of drawings from elsewhere */
  externalSheets: number;
  /** Memory the layers and drawings from elsewhere take as pixels (bytes, estimated: 4 per pixel) */
  memoryBytes: number;
  /** Undo steps recorded */
  historySteps: number;
  /** Most undo steps kept */
  historyLimit: number;
}

/**
 * A canvas's pixels as a PNG data URL.
 */
const toPngDataUrl = async (canvas: OffscreenCanvas): Promise<string> => {
  // A canvas that was never drawn on has no context yet, and can't be encoded without one
  canvas.getContext("2d");
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return `data:image/png;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
};

/**
 * Decode a PNG data URL into an image.
 */
const fromPngDataUrl = (dataUrl: string): Promise<ImageBitmap> =>
  createImageBitmap(
    new Blob([base64ToBytes(dataUrl.slice(dataUrl.indexOf(",") + 1))], {
      type: "image/png",
    }),
  );

/** Receives the drawing messages PaintCanvas sends; a returned promise that rejects means a patch wasn't delivered */
export type MessageListener = (message: CanvasMessage) => void | Promise<void>;

/** Options for sending drawing messages (see `startSending`) */
export interface SendingOptions {
  /** Send patches of the user's drawing (default true) */
  patches?: boolean;
  /** Send each finished stroke (default false) */
  strokes?: boolean;
  /** How long to wait after a change before sending a patch, so quick changes go together (milliseconds) */
  delayMs?: number;
}

/** A stroke to draw: what a stroke message holds, without the protocol details */
export type StrokeData = Omit<
  StrokeMessage,
  "protocol" | "type" | "step" | "layer"
>;

/**
 * Decode a patch into pixels.
 */
const decodePatch = async (
  patch: PatchMessage,
): Promise<ImageData | ImageBitmap> => {
  if (patch.encoding === ImageEncoding.Png)
    return createImageBitmap(
      new Blob([base64ToBytes(patch.data)], { type: "image/png" }),
    );
  const { width, height } = boundingBoxSize(patch.coords);
  return new ImageData(
    await decodeRgbaDeflate(patch.data, patch.coords),
    width,
    height,
  );
};

export interface PaintCanvasOptions {
  /** Canvas width in pixels */
  width?: number;
  /** Canvas height in pixels */
  height?: number;
  /** Largest canvas width or height allowed (default `MAX_CANVAS_SIZE`) */
  maxCanvasSize?: number;
  /** Most layers the user can have (default `DEFAULT_MAX_LAYERS`) */
  maxLayers?: number;
  /** Creates layer canvases (replaceable for tests) */
  createCanvas?: CanvasFactory;
  /** Where custom brush presets are kept (defaults to keeping them in memory only) */
  presetStore?: PresetStoreLike;
  /** Who the custom presets belong to, passed to the preset store (default `DEFAULT_OWNER_ID`) */
  ownerId?: string;
  /** Gives the author of presets made with `newPreset` (asked each time, so it can follow name changes) */
  presetAuthor?: () => AssetAuthor;
  /** Names to use instead of PaintCanvas's own (see `DEFAULT_NAMES`) */
  names?: Partial<PaintCanvasNames>;
  /** Where to keep the user's layers so the drawing survives reloading the page (see `useLayerStore`) */
  layerStore?: LayerStoreLike;
  /**
   * The system clipboard, which copying and cutting also put a PNG of the copied image data on so other apps (and brush
   * shapes) can use it (the browser's by default; `null` for none)
   */
  systemClipboard?: SystemClipboardLike | null;
}

/** The part of the system clipboard PaintCanvas writes to (the browser's `navigator.clipboard`) */
export type SystemClipboardLike = Pick<Clipboard, "write">;

/**
 * The painting engine: canvas size, layers, brush and eraser settings, custom presets, the selected tool, foreground and background colours,
 * selection, transforms, clipboard, undo/redo history, viewport and input settings. Where its data is kept and who it
 * is shared with are up to the implementer (see `onMessage` and `receive`).
 *
 * Dispatches a `change` event whenever its own state changes. Layers, brushes and selection dispatch their own `change`
 * events. Also dispatches `pointer` when the pointer moves over the canvas.
 *
 * @example
 * const canvas = new PaintCanvas({ width: 1000, height: 800 });
 * canvas.selectTool(Tool.Brush, { fromToolbar: true });
 * canvas.setColour("#ff0000");
 * canvas.setColour("#ffffff", "background");
 */
export default class PaintCanvas extends EventTarget {
  /** Brush settings */
  readonly brush = new BrushSettings(brushPresets);

  /** Eraser settings */
  readonly eraser = new BrushSettings(eraserPresets);

  /** The user's own and imported brush presets, listed with the brush and eraser presets */
  readonly customPresets: CustomPresets;

  /** Lasso shape in progress */
  readonly lasso = new Lasso();

  /** Brush shapes, loaded per preset */
  readonly tips = new BrushTipCache();

  /** Log of strokes started, ended, cancelled and ignored, with timings, for debugging */
  readonly strokeLog = new StrokeLog();

  /** Whether the debug log shows (see `showDebugLog`) */
  protected debugLogShown = false;

  /** Slow work that waits for pauses in drawing (syncing, the canvas map and layer thumbnails, saving) */
  readonly background = new BackgroundWork(this.strokeLog);

  /** How the user's input devices control the canvas (scrolling, pinching, touch gestures, focus pen mode) */
  readonly input = new InputSettings();

  /** The user's interface choices (theme and language), kept with the other app settings */
  readonly ui = new UiSettings();

  /** The user's saved colours, shown as swatches */
  readonly palette = new Palette();

  /** The user's keyboard shortcuts: each configurable action's key combination */
  readonly shortcuts = new ShortcutSettings();
  /** The user's pointer position over the canvas, in canvas pixels (undefined when off the canvas) */
  pointer?: Point;

  /** Selected tool */
  tool: Tool = Tool.Brush;

  /** Tool used temporarily while a key is held (e.g. Space for pan), overriding the selected tool */
  heldTool: Tool | null = null;

  /** Open panel, if any */
  panel: Panel | null = null;

  /** Whether the interface (toolbar, panels and anything the implementer adds) is visible ("tab" key) */
  interfaceVisible = true;

  /**
   * Whether scaling the Move tool's box keeps its proportions ("Constrain proportions"), from its settings bar and when
   * dragging a handle. Off by default; while drag-scaling, holding Shift turns it on (when off) and Alt turns it off
   * (when on), until released.
   */
  constrainProportions = false;

  /** How the colour sample tool samples ("point" by default) */
  sampleMode: SampleMode = "point";

  private canvasWidth: number;

  private canvasHeight: number;

  private layerStack: LayerStack;

  private view: Viewport;

  private strokeEngine: StrokeEngine;

  private currentSelection: Selection;

  private transformer: Transformer;

  // Keep the transform box up to date when the layer or mask changes. While pixels are being transformed, only a change of active
  // layer matters (the transform is applied and a new one starts on the newly selected layer).
  private readonly onLayersOrMaskChange = () => {
    const transformer = this.transformer;
    if (!transformer.pending || transformer.layer !== this.layerStack.active)
      this.syncTransform();
  };

  private readonly onStrokeBegin = () => this.background.strokeStarted();

  private readonly onStrokeEnd = () => this.background.strokeEnded();

  // Record the area a finished stroke is about to change, so it can be undone
  private readonly onStrokeCommit = (event: Event) => {
    const { layer, area, stroke } = (event as CustomEvent<StrokeCommitDetail>)
      .detail;
    this.layerStack.recordImage(layer.id, area);
    if (!this.sendingStrokes || this.replaying) return;
    void this.emit({
      protocol: PROTOCOL_VERSION,
      type: CanvasMessageType.Stroke,
      // A stroke drawn while history isn't recording (see `History.untracked`) has no step, so it gets its own
      step: this.history.latestStep ?? crypto.randomUUID(),
      layer: layer.id,
      ...stroke,
    }).catch(() => undefined);
  };

  // Tell others about undo and redo while sending
  private readonly onHistoryStep = (event: Event) => {
    if (!this.isSending) return;
    void this.emit({
      protocol: PROTOCOL_VERSION,
      type:
        event.type === UNDO_EVENT
          ? CanvasMessageType.Undo
          : CanvasMessageType.Redo,
      step: (event as CustomEvent<HistoryStepDetail>).detail.step,
    }).catch(() => undefined);
  };

  /** Whether drawing messages are sent (see `startSending`) */
  private isSending = false;

  /** Whether finished strokes are sent (see `startSending`) */
  private sendingStrokes = false;

  /** Whether a stroke from elsewhere is being drawn (it isn't sent again) */
  private replaying = false;

  private currentColours: Record<ColourSlot, string> = {
    foreground: DEFAULT_COLOUR,
    background: DEFAULT_BACKGROUND_COLOUR,
  };

  private currentSelectedColour: ColourSlot = "foreground";

  /** Image data copied with cut or copy, and the area it was copied from */
  private clipboard?: { image: OffscreenCanvas; area: Rect };

  /** How many times image data has been copied (see `copyCount`) */
  private copies = 0;

  /** The system clipboard copies are also put on, if any */
  private readonly systemClipboard?: SystemClipboardLike;

  /** Drawings from elsewhere */
  private externalSheets: ExternalSheets;

  /** Who receives the drawing messages this canvas sends */
  private readonly messageListeners = new Set<MessageListener>();

  /** Sends patches while sending (see `startSending`) */
  private sender?: PatchSender;

  /** The layer stack whose changes are being sent */
  private sendingLayers?: LayerStack;

  // Send the changes soon after the user's layers change
  private readonly onLayersChangeToSend = () => this.sender?.schedule();

  /** Creates the canvases the app draws on (fake ones in tests) */
  readonly createCanvas: CanvasFactory;

  /** Who the custom presets belong to (passed to the preset store) */
  readonly ownerId: string;

  /** The largest canvas width or height allowed */
  readonly maxCanvasSize: number;

  /** Most layers the user can have */
  readonly maxLayers: number;

  /** Names users see and saved files are called by (see `PaintCanvasNames`) */
  readonly names: Readonly<PaintCanvasNames>;

  /** Gives the author of presets made with `newPreset` */
  private readonly presetAuthor: () => AssetAuthor;

  /** Keeps the user's layers in a store, while one is used */
  private layerAutosave?: LayerAutosave;

  constructor(options: PaintCanvasOptions = {}) {
    super();
    // Nothing is logged for debugging until the debug log shows
    this.strokeLog.enabled = false;
    this.ownerId = options.ownerId ?? DEFAULT_OWNER_ID;
    this.maxCanvasSize = options.maxCanvasSize ?? MAX_CANVAS_SIZE;
    this.maxLayers = options.maxLayers ?? DEFAULT_MAX_LAYERS;
    this.names = { ...DEFAULT_NAMES, ...options.names };
    this.presetAuthor =
      options.presetAuthor ?? (() => ({ name: DEFAULT_AUTHOR }));
    this.tips.preload(this.brush.presets);
    this.tips.preload(this.eraser.presets);
    this.customPresets = new CustomPresets(this.ownerId, options.presetStore);
    this.customPresets.addEventListener("change", () =>
      this.listCustomPresets(),
    );
    void this.customPresets.load().catch(() => undefined);
    this.createCanvas = options.createCanvas ?? createOffscreenCanvas;
    this.systemClipboard =
      options.systemClipboard === null
        ? undefined
        : (options.systemClipboard ?? globalThis.navigator?.clipboard);
    this.canvasWidth = DEFAULT_CANVAS_SIZE;
    this.canvasHeight = DEFAULT_CANVAS_SIZE;
    this.layerStack = new LayerStack(
      this.canvasWidth,
      this.canvasHeight,
      this.createCanvas,
      this.maxLayers,
    );
    this.view = new Viewport(this.canvasWidth, this.canvasHeight);
    this.strokeEngine = new StrokeEngine(
      this.canvasWidth,
      this.canvasHeight,
      this.createCanvas,
    );
    this.currentSelection = new Selection(
      this.canvasWidth,
      this.canvasHeight,
      this.createCanvas,
    );
    this.transformer = new Transformer(
      this.canvasWidth,
      this.canvasHeight,
      this.createCanvas,
    );
    this.externalSheets = new ExternalSheets(
      this.canvasWidth,
      this.canvasHeight,
      this.createCanvas,
    );
    this.watchLayersAndMask();
    if (options.width !== undefined || options.height !== undefined) {
      this.setCanvasSize(
        options.width ?? this.canvasWidth,
        options.height ?? this.canvasHeight,
      );
    }
    if (options.layerStore) this.useLayerStore(options.layerStore);
  }
  /** Canvas width in pixels */
  get width(): number {
    return this.canvasWidth;
  }

  /** Canvas height in pixels */
  get height(): number {
    return this.canvasHeight;
  }

  /** Drawings from elsewhere (e.g. other people's), drawn under the user's own layers (see `receive`) */
  get external(): ExternalSheets {
    return this.externalSheets;
  }

  /** Everything drawn on the canvas, top first: the user's own layers, then drawings from elsewhere */
  get drawables(): readonly DrawableLayer[] {
    return [...this.layerStack.layers, ...this.externalSheets.sheets];
  }

  /**
   * Listen for the drawing messages this canvas sends, e.g. to pass them to other people. Returns a function that stops
   * listening.
   *
   * @example
   * const stop = canvas.onMessage((message) => transport.send(message));
   * canvas.startSending();
   */
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * Give a message to every listener. Rejects if any listener's delivery fails.
   */
  private async emit(message: CanvasMessage): Promise<void> {
    await Promise.all(
      [...this.messageListeners].map((listener) => listener(message)),
    );
  }

  /**
   * Start sending drawing messages to `onMessage` listeners:
   * - patches (by default): shortly after the user's layers change (and once drawing pauses), the area of their drawing
   *   that changed
   * - strokes (when asked): each finished brush or eraser stroke
   * - undo and redo: the step undone or redone
   *
   * Changing the canvas size stops sending.
   */
  startSending(options: SendingOptions = {}): void {
    this.stopSending();
    this.isSending = true;
    this.sendingStrokes = options.strokes ?? false;
    if (options.patches === false) return;
    this.sender = new PatchSender({
      width: this.canvasWidth,
      height: this.canvasHeight,
      layers: () => this.layerStack.layers,
      createCanvas: this.createCanvas,
      delayMs: options.delayMs,
      // Wait for a pause in drawing, so sending doesn't hold up the next stroke
      whenIdle: (run) => this.background.run("sync", run),
      send: (message) => this.emit(message),
    });
    this.sendingLayers = this.layerStack;
    this.layerStack.addEventListener("change", this.onLayersChangeToSend);
  }

  /**
   * Stop sending patches. Changes waiting to be sent are dropped.
   */
  stopSending(): void {
    this.isSending = false;
    this.sendingStrokes = false;
    this.sender?.stop();
    this.sender = undefined;
    this.sendingLayers?.removeEventListener(
      "change",
      this.onLayersChangeToSend,
    );
    this.sendingLayers = undefined;
  }

  /** Whether drawing messages are being sent (see `startSending`) */
  get sending(): boolean {
    return this.isSending;
  }

  /**
   * Send a patch of what changed now instead of waiting. Resolves once sent (or straight away when not sending
   * patches).
   */
  async sendNow(): Promise<void> {
    await this.sender?.sync();
  }

  /**
   * Count pixels of the user's drawing as already sent, so they aren't sent again (e.g. their earlier work, restored
   * from a shared drawing's history).
   */
  markSent(area: BoundingBox, rgba: Uint8ClampedArray): void {
    this.sender?.markSent(area, rgba);
  }

  /**
   * A patch of the user's whole drawing (all their layers, flattened), e.g. for someone who joins late. Undefined if
   * nothing is drawn.
   */
  async snapshot(): Promise<PatchMessage | undefined> {
    const { canvasWidth: width, canvasHeight: height } = this;
    const canvas = this.createCanvas(width, height);
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    }) as OffscreenCanvasRenderingContext2D;
    drawLayers(context, this.layerStack.layers);
    const rgba = context.getImageData(0, 0, width, height).data;
    if (!rgba.some((value, i) => i % 4 === 3 && value > 0)) return undefined;
    const coords: BoundingBox = [0, 0, width, height];
    return createPatchMessage(
      coords,
      ImageEncoding.RgbaDeflate,
      await encodeRgbaDeflate(rgba, coords),
    );
  }

  /**
   * Apply a drawing message received from a source (an ID the implementer chooses, e.g. a user ID): a patch is drawn
   * onto that source's sheet. Messages are checked first; invalid ones are ignored. Resolves to whether it was applied.
   *
   * @example
   * transport.onMessage((from, message) => canvas.receive(from, message));
   */
  async receive(source: string, message: unknown): Promise<boolean> {
    const result = validateCanvasMessage(message);
    if (!result.valid) return false;
    const valid = result.value;
    if (valid.type === CanvasMessageType.Patch) {
      await this.externalSheets.apply(source, valid);
      return true;
    }
    if (valid.type === CanvasMessageType.Stroke) {
      const { width, height } = this;
      await this.externalSheets.paint(source, (canvas) => {
        // The sheet's canvas stands in for a layer, so the stroke engine can draw on it
        const sheetLayer = new Layer(
          { name: source },
          width,
          height,
          () => canvas,
        );
        this.replay(
          new StrokeEngine(width, height, this.createCanvas),
          sheetLayer,
          valid,
        );
      });
      return true;
    }
    // Undo and redo: the pixels they change arrive as patches; listeners of the "history" event can do more
    this.dispatchEvent(
      new CustomEvent("history", { detail: { source, message: valid } }),
    );
    return true;
  }

  /**
   * The drawing as a document: its size, the user's layers and drawings from elsewhere, with PNG images (see
   * `PaintCanvasDocument`). Turn it into JSON to save it as a file.
   *
   * @example
   * const json = JSON.stringify(await canvas.exportDocument());
   */
  async exportDocument(): Promise<PaintCanvasDocument> {
    const layers = this.layerStack.layers;
    return {
      format: DOCUMENT_FORMAT,
      version: DOCUMENT_VERSION,
      width: this.canvasWidth,
      height: this.canvasHeight,
      layers: await Promise.all(
        layers.map(async (layer) => {
          const { name, visible, opacity, blendMode, alphaLock } =
            layer.toConfig();
          return {
            name,
            visible,
            opacity,
            blendMode,
            alphaLock,
            image: await toPngDataUrl(layer.canvas),
          };
        }),
      ),
      activeLayer: layers.indexOf(this.layerStack.active),
      external: await Promise.all(
        this.externalSheets.sheets.map(async ({ source, canvas }) => ({
          source,
          image: await toPngDataUrl(canvas),
        })),
      ),
    };
  }

  /**
   * Replace the drawing with a document (e.g. read from a file): its size, layers and drawings from elsewhere. Undo
   * history starts again. Returns whether it was loaded: not when the document is invalid or an image can't be
   * decoded, and then nothing changes.
   *
   * @example
   * await canvas.importDocument(JSON.parse(text));
   */
  async importDocument(document: unknown): Promise<boolean> {
    const result = isValidDocument(document);
    if (!result.valid || result.value.layers.length > this.maxLayers)
      return false;
    const doc = result.value;
    const images = await Promise.all([
      ...doc.layers.map((layer) => fromPngDataUrl(layer.image)),
      ...doc.external.map((sheet) => fromPngDataUrl(sheet.image)),
    ]).catch(() => undefined);
    if (!images) return false;
    const configs = doc.layers.map(
      ({ name, visible, opacity, blendMode, alphaLock }) => ({
        id: crypto.randomUUID(),
        name,
        visible,
        opacity,
        blendMode: blendMode as BlendMode,
        alphaLock,
      }),
    );
    this.restoreLayers(
      doc.width,
      doc.height,
      configs,
      images,
      (configs[doc.activeLayer] as LayerConfig & { id: string }).id,
    );
    doc.external.forEach((sheet, i) =>
      this.externalSheets.restore(
        sheet.source,
        images[configs.length + i] as ImageBitmap,
      ),
    );
    return true;
  }

  /**
   * Replace the canvas size and the user's layers (top first, each with its image) and select one by ID. Undo history
   * starts again. Throws if the size or number of layers isn't allowed.
   *
   * @example
   * canvas.restoreLayers(800, 600, [{ id: "a", name: "Sketch" }], [sketchImage], "a");
   */
  restoreLayers(
    width: number,
    height: number,
    layers: readonly LayerConfig[],
    images: readonly CanvasImageSource[],
    activeLayer: string,
  ): void {
    if (layers.length > this.maxLayers)
      throw new Error(`Cannot have more than ${this.maxLayers} layers`);
    this.setCanvasSize(width, height);
    this.layerStack
      .replace(layers)
      .forEach((layer, i) =>
        layer.context.drawImage(images[i] as CanvasImageSource, 0, 0),
      );
    this.layerStack.select(activeLayer);
    this.history.clear();
  }

  /** Keeps the user's layers in a store, while one is used (see `useLayerStore`) */
  get autosave(): LayerAutosave | undefined {
    return this.layerAutosave;
  }

  /**
   * Keep the user's layers in a store (or stop, without one), so the drawing survives reloading the page: the saved
   * drawing is restored, then changes are saved. Only one window draws on a drawing at a time (see `LayerAutosave`).
   * Returns the autosave.
   *
   * @example
   * canvas.useLayerStore(new IndexedDbLayerStore("my-drawing"));
   */
  useLayerStore(
    store: LayerStoreLike | undefined,
    options?: AutosaveOptions,
  ): LayerAutosave | undefined {
    void this.layerAutosave?.stop();
    this.layerAutosave = store
      ? new LayerAutosave(this, store, options)
      : undefined;
    this.layerAutosave?.start();
    this.notify();
    return this.layerAutosave;
  }

  /**
   * How much the canvas holds: its size, layers, drawings from elsewhere, memory and undo steps.
   */
  stats(): CanvasStats {
    const sheets =
      this.layerStack.layers.length + this.externalSheets.sheets.length;
    return {
      width: this.canvasWidth,
      height: this.canvasHeight,
      layers: this.layerStack.layers.length,
      externalSheets: this.externalSheets.sheets.length,
      memoryBytes: this.canvasWidth * this.canvasHeight * 4 * sheets,
      historySteps: this.history.size,
      historyLimit: this.history.limit,
    };
  }

  /**
   * Draw a recorded stroke (e.g. received from elsewhere) onto one of the user's layers, as an action they can undo.
   * It isn't sent as a stroke message. Does nothing during a stroke, or if there's no such layer. Returns whether it was
   * drawn.
   *
   * @example
   * canvas.drawStroke(canvas.layers.active.id, strokeMessage);
   */
  drawStroke(layerId: string, stroke: StrokeData): boolean {
    const layer = this.layerStack.layers.find(
      (existing) => existing.id === layerId,
    );
    if (!layer || this.strokeEngine.drawing || stroke.points.length === 0)
      return false;
    this.replaying = true;
    try {
      this.replay(this.strokeEngine, layer, stroke);
    } finally {
      this.replaying = false;
    }
    return true;
  }

  /**
   * Draw a recorded stroke with a stroke engine, point by point.
   */
  private replay(engine: StrokeEngine, layer: Layer, stroke: StrokeData): void {
    const [first, ...rest] = stroke.points as [
      StrokeData["points"][number],
      ...StrokeData["points"],
    ];
    engine.begin(
      {
        layer,
        mode: stroke.mode,
        preset: stroke.preset,
        size: stroke.size,
        colour: stroke.colour,
        tip: this.tips.get(stroke.preset),
        isPen: stroke.isPen,
        seed: stroke.seed,
      },
      first,
      first.time,
    );
    const last = rest.pop() ?? first;
    for (const point of rest) engine.move(point, point.time);
    engine.end(last, last.time);
  }

  /**
   * Put a patch's pixels onto one of the user's layers (replacing what was there), as an action they can undo. Returns
   * whether it was applied: not for an invalid patch, or if there's no such layer.
   *
   * @example
   * await canvas.applyPatch(canvas.layers.active.id, patch);
   */
  async applyPatch(layerId: string, patch: unknown): Promise<boolean> {
    const result = validateCanvasMessage(patch);
    if (!result.valid || result.value.type !== CanvasMessageType.Patch)
      return false;
    const valid = result.value;
    const image = await decodePatch(valid).catch(() => undefined);
    const layer = this.layerStack.layers.find(
      (existing) => existing.id === layerId,
    );
    if (!image || !layer) return false;
    const [x, y] = valid.coords;
    const { width, height } = boundingBoxSize(valid.coords);
    this.layerStack.changeImage(layer.id, { x, y, width, height }, (ctx) => {
      ctx.clearRect(x, y, width, height);
      if (image instanceof ImageData) ctx.putImageData(image, x, y);
      else ctx.drawImage(image, x, y);
    });
    return true;
  }
  /**
   * The colour shown at a canvas point (every layer mixed as shown, over the white background), or undefined outside the
   * canvas.
   *
   * @example
   * app.sampleColour({ x: 10.4, y: 20.9 }); // "#ff0000"
   */
  sampleColour(point: Point): string | undefined {
    const area = pixelRect(point, point, this.width, this.height);
    if (!area) return undefined;
    return averageColour(readPixels(this.flatten(area)));
  }

  /**
   * The average colour shown in the rectangle between two canvas points (cut to the canvas), counting every pixel, or
   * undefined outside the canvas. With `maxPixels`, it's worked out from the area scaled down to at most that many
   * pixels across, which is quicker (for a preview while dragging).
   *
   * @example
   * app.sampleAreaColour({ x: 0, y: 0 }, { x: 99, y: 99 }); // the average of 100 × 100 pixels
   */
  sampleAreaColour(
    a: Point,
    b: Point,
    maxPixels = Number.POSITIVE_INFINITY,
  ): string | undefined {
    const area = pixelRect(a, b, this.width, this.height);
    if (!area) return undefined;
    const scale = Math.min(1, maxPixels / Math.max(area.width, area.height));
    return averageColour(
      readPixels(
        this.flatten(
          area,
          Math.max(1, Math.round(area.width * scale)),
          Math.max(1, Math.round(area.height * scale)),
        ),
      ),
    );
  }

  /**
   * The `SAMPLE_PIXELS` × `SAMPLE_PIXELS` canvas pixels around a point as shown (the point's pixel is at the middle,
   * rounding down), for the colour sample tool's enlarged view. Pixels outside the canvas are transparent.
   */
  samplePixels(point: Point): OffscreenCanvas {
    const half = SAMPLE_PIXELS / 2;
    return this.flatten({
      x: Math.floor(point.x) - half,
      y: Math.floor(point.y) - half,
      width: SAMPLE_PIXELS,
      height: SAMPLE_PIXELS,
    });
  }

  /** Draw an area of the canvas as shown onto a new canvas (see `flattenArea`) */
  private flatten(area: PixelRect, width?: number, height?: number) {
    return flattenArea(
      this.drawables,
      this.createCanvas,
      this.width,
      this.height,
      area,
      width,
      height,
    );
  }

  /** The user's view of the canvas (zoom and position) */
  get viewport(): Viewport {
    return this.view;
  }

  /** Whether the debug log shows */
  get debugLog(): boolean {
    return this.debugLogShown;
  }

  /**
   * Show or hide the debug log. Strokes and timings are only recorded while it shows.
   */
  showDebugLog(shown: boolean): void {
    this.debugLogShown = shown;
    this.strokeLog.enabled = shown;
    this.notify();
  }

  /** Draws brush and eraser strokes */
  get strokes(): StrokeEngine {
    return this.strokeEngine;
  }

  /** The mask limiting where drawing applies */
  get selection(): Selection {
    return this.currentSelection;
  }

  /** Moves, scales and rotates the active layer's pixels with the Move tool */
  get transform(): Transformer {
    return this.transformer;
  }

  /** The user's undoable actions */
  get history(): History {
    return this.layerStack.history;
  }

  /**
   * Listen for layer and mask changes on the current layer stack and selection, and for strokes starting and ending
   * (background work waits for pauses in drawing).
   */
  private watchLayersAndMask(): void {
    this.layerStack.addEventListener("change", this.onLayersOrMaskChange);
    this.currentSelection.addEventListener("change", this.onLayersOrMaskChange);
    this.strokeEngine.addEventListener(
      BEFORE_COMMIT_EVENT,
      this.onStrokeCommit,
    );
    this.strokeEngine.addEventListener(STROKE_BEGIN_EVENT, this.onStrokeBegin);
    this.strokeEngine.addEventListener(STROKE_END_EVENT, this.onStrokeEnd);
    this.history.addEventListener(UNDO_EVENT, this.onHistoryStep);
    this.history.addEventListener(REDO_EVENT, this.onHistoryStep);
  }

  /**
   * Show the transform box when the Move tool is selected, and apply any transform when switching away or to another layer.
   */
  private syncTransform(): void {
    const transformer = this.transformer;
    if (this.tool !== Tool.Move) {
      if (transformer.pending) this.commitTransform();
      else if (transformer.active) {
        transformer.reset();
        transformer.dispatchEvent(new Event("change"));
      }
      return;
    }
    if (transformer.pending && transformer.layer === this.layerStack.active)
      return;
    if (transformer.pending) this.commitTransform();
    transformer.prepare(this.layerStack.active, this.currentSelection.mask);
  }

  /**
   * Write the transformed pixels into the layer (Enter, or switching tool). The mask moves with them.
   */
  commitTransform(): void {
    const layer = this.transformer.layer;
    const result = this.transformer.commit();
    if (!layer || !result) return;
    const { maskPiece, source, box, area, before } = result;
    this.layerStack.recordImage(layer.id, area, before);
    if (maskPiece) {
      this.currentSelection.moveArea(maskPiece, source, boxBounds(box), (ctx) =>
        drawTransformed(ctx, maskPiece, box),
      );
    }
    this.layerStack.markChanged(layer.id);
  }

  /**
   * Undo the user's latest action. A move or rotate that hasn't been applied is cancelled instead, and nothing happens
   * during a stroke.
   */
  undo(): void {
    if (this.canStepHistory()) this.history.undo();
  }

  /**
   * Redo the user's latest undone action. A move or rotate that hasn't been applied is cancelled instead, and nothing
   * happens during a stroke.
   */
  redo(): void {
    if (this.canStepHistory()) this.history.redo();
  }

  /**
   * Whether undo or redo can move along the history now: not during a stroke, and not while a transform is pending (which
   * is cancelled instead).
   */
  private canStepHistory(): boolean {
    if (this.strokeEngine.drawing) return false;
    if (!this.transformer.pending) return true;
    this.cancelTransform();
    return false;
  }

  /**
   * Put transformed pixels back where they were (Escape).
   */
  cancelTransform(): void {
    const pasting = this.transformer.pasting;
    this.transformer.cancel();
    // Show the selected layer's box again in place of the discarded pasted pixels
    if (pasting) this.syncTransform();
  }

  /**
   * Copy the masked image data of the selected layer to the clipboard. Needs a mask with image data inside it; does
   * nothing during a stroke or while a transform is pending. Returns the area copied, if any.
   */
  copy(): Rect | undefined {
    return this.copyMasked(this.layerStack.active.canvas);
  }

  /**
   * Copy the masked image data of all the shown layers, mixed as they're shown (each layer's opacity and blend mode,
   * without the white background), to the clipboard. Hidden layers are left out. Like `copy`, it needs a mask with image
   * data inside it, and does nothing during a stroke or while a transform is pending. Returns the area copied, if any.
   *
   * @example
   * app.selection.selectAll();
   * app.copyMerged(); // { x: 10, y: 20, width: 30, height: 5 }: the part of the canvas with paint on any shown layer
   */
  copyMerged(): Rect | undefined {
    if (!this.canCopy) return undefined;
    const merged = this.createCanvas(this.width, this.height);
    drawLayers(
      merged.getContext("2d") as OffscreenCanvasRenderingContext2D,
      this.layerStack.layers,
    );
    return this.copyMasked(merged);
  }

  /**
   * Copy the masked part of a canvas-sized image to the clipboard (see `copy`), returning the area copied, if any.
   */
  private copyMasked(source: OffscreenCanvas): Rect | undefined {
    const area = this.maskedArea(source);
    const mask = this.currentSelection.mask;
    if (!area || !mask) return undefined;
    const image = copyArea(this.createCanvas, source, area);
    applyMask(image, copyArea(this.createCanvas, mask, area));
    this.clipboard = { image, area };
    this.copies++;
    this.writeSystemClipboard(image);
    this.notify();
    return area;
  }

  /**
   * How many times image data has been copied or cut, to tell whether it was copied here since something else may have
   * been copied in another app (see `KeyboardShortcuts`).
   */
  get copyCount(): number {
    return this.copies;
  }

  /** Whether there is copied image data to paste (see `copy` and `cut`) */
  get hasClipboard(): boolean {
    return this.clipboard !== undefined;
  }

  /**
   * The copied image data as a PNG, if there is any (e.g. to use as a brush shape).
   *
   * @example
   * const png = await canvas.copiedPng(); // Blob of type "image/png", or undefined
   */
  async copiedPng(): Promise<Blob | undefined> {
    return this.clipboard?.image.convertToBlob({ type: "image/png" });
  }

  /**
   * Put copied image data on the system clipboard as a PNG, if there is one and the browser can. The item is made
   * straight away (some browsers only allow writing while handling the key press or click) with the PNG to follow.
   * Failing (e.g. the page isn't focused) changes nothing: the image data can still be pasted here.
   */
  private writeSystemClipboard(image: OffscreenCanvas): void {
    if (!this.systemClipboard || typeof ClipboardItem === "undefined") return;
    const item = new ClipboardItem({
      "image/png": image.convertToBlob({ type: "image/png" }),
    });
    this.systemClipboard.write([item]).catch(() => undefined);
  }

  /**
   * Copy the masked image data of the selected layer to the clipboard, then remove it from the layer as one undoable
   * action (see `deleteMasked`).
   */
  cut(): void {
    const area = this.copy();
    if (area) this.clearMasked(area);
  }

  /**
   * Erase the masked image data from the selected layer as one undoable action (Delete or Backspace). When the layer's
   * alpha lock is on, it is painted with the background colour instead, keeping its transparency. Needs a mask with
   * image data inside it; does nothing during a stroke or while a transform is pending.
   */
  deleteMasked(): void {
    const area = this.maskedArea();
    if (area) this.clearMasked(area);
  }

  /**
   * Fill the selected layer with the foreground or background colour as one undoable action: only the masked area when
   * there is a mask (partly where it is partly), and only existing pixels when the layer's alpha lock is on. Does
   * nothing during a stroke or while a transform is pending.
   *
   * @example
   * canvas.fill("foreground");
   */
  fill(slot: ColourSlot): void {
    if (this.strokeEngine.drawing || this.transformer.pending) return;
    const area = this.fillArea();
    if (area) this.paintArea(area, this.currentColours[slot]);
  }

  /**
   * The area a fill changes: the mask's bounds (or the whole canvas without a mask), cut to the selected layer's image
   * data when its alpha lock is on. None if that is empty.
   */
  private fillArea(): Rect | undefined {
    const { width, height } = this;
    const layer = this.layerStack.active;
    const mask = this.currentSelection.mask;
    const maskData = mask
      ? (
          mask.getContext("2d") as OffscreenCanvasRenderingContext2D
        ).getImageData(0, 0, width, height).data
      : undefined;
    if (layer.alphaLock) {
      return contentBounds(
        layer.context.getImageData(0, 0, width, height).data,
        width,
        height,
        maskData,
      );
    }
    return maskData
      ? contentBounds(maskData, width, height)
      : { x: 0, y: 0, width, height };
  }

  /** Whether image data can be copied now: not during a stroke or while a transform is pending */
  private get canCopy(): boolean {
    return !this.strokeEngine.drawing && !this.transformer.pending;
  }

  /**
   * The bounds of a canvas-sized image's data (the selected layer's by default) inside the mask, if there is a mask
   * with image data inside it. None during a stroke or while a transform is pending.
   */
  private maskedArea(
    source: OffscreenCanvas = this.layerStack.active.canvas,
  ): Rect | undefined {
    const mask = this.currentSelection.mask;
    if (!mask || !this.canCopy) return undefined;
    const { width, height } = this;
    return contentBounds(
      (
        source.getContext("2d") as OffscreenCanvasRenderingContext2D
      ).getImageData(0, 0, width, height).data,
      width,
      height,
      (mask.getContext("2d") as OffscreenCanvasRenderingContext2D).getImageData(
        0,
        0,
        width,
        height,
      ).data,
    );
  }

  /**
   * Erase the mask's part of an area from the selected layer, or paint it with the background colour when the layer's
   * alpha lock is on, as one undoable action.
   */
  private clearMasked(area: Rect): void {
    const layer = this.layerStack.active;
    if (layer.alphaLock) {
      this.paintArea(area, this.currentColours.background);
      return;
    }
    const mask = this.currentSelection.mask as OffscreenCanvas;
    const maskPiece = copyArea(this.createCanvas, mask, area);
    this.layerStack.changeImage(layer.id, area, (ctx) => {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(maskPiece, area.x, area.y);
      ctx.restore();
    });
  }

  /**
   * Paint a colour over an area of the selected layer, cut to the mask if there is one (partly where it is partly), as
   * one undoable action. Only existing pixels are painted when the layer's alpha lock is on.
   */
  private paintArea(area: Rect, colour: string): void {
    const layer = this.layerStack.active;
    const mask = this.currentSelection.mask;
    const paint = this.createCanvas(area.width, area.height);
    const paintCtx = paint.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    if (mask) {
      paintCtx.drawImage(copyArea(this.createCanvas, mask, area), 0, 0);
      paintCtx.globalCompositeOperation = "source-in";
    }
    paintCtx.fillStyle = colour;
    paintCtx.fillRect(0, 0, area.width, area.height);
    this.layerStack.changeImage(layer.id, area, (ctx) => {
      ctx.save();
      ctx.globalCompositeOperation = layer.alphaLock
        ? "source-atop"
        : "source-over";
      ctx.drawImage(paint, area.x, area.y);
      ctx.restore();
    });
  }

  /**
   * Show the clipboard's image data over the selected layer where it was copied from, and select the Move tool to place,
   * scale and rotate it. It is written into the layer (and sent) on Enter or when switching to another tool; Escape
   * discards it. A pending transform is applied first.
   */
  paste(): void {
    const clipboard = this.clipboard;
    if (!clipboard || this.strokeEngine.drawing) return;
    if (this.transformer.pending) this.commitTransform();
    this.selectTool(Tool.Move);
    this.transformer.float(
      this.layerStack.active,
      clipboard.image,
      clipboard.area,
    );
  }

  /**
   * Show an image from elsewhere (e.g. pasted from another app) over the selected layer, in the middle of the part of
   * the canvas in view, and select the Move tool to place, scale and rotate it, like `paste`. An image larger than the
   * canvas is shrunk to fit it. Does nothing during a stroke.
   *
   * @example
   * canvas.pasteImage(await createImageBitmap(file));
   */
  pasteImage(
    source: CanvasImageSource & { width: number; height: number },
  ): void {
    if (this.strokeEngine.drawing) return;
    const scale = Math.min(
      1,
      this.canvasWidth / source.width,
      this.canvasHeight / source.height,
    );
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const image = this.createCanvas(width, height);
    (image.getContext("2d") as OffscreenCanvasRenderingContext2D).drawImage(
      source,
      0,
      0,
      width,
      height,
    );
    const view = this.view.visibleRect();
    const area = {
      x: Math.round(view.x + (view.width - width) / 2),
      y: Math.round(view.y + (view.height - height) / 2),
      width,
      height,
    };
    if (this.transformer.pending) this.commitTransform();
    this.selectTool(Tool.Move);
    this.transformer.float(this.layerStack.active, image, area);
  }

  /**
   * Apply a finished lasso action to the mask: a shape is added, subtracted or replaces it; a plain click deselects.
   */
  applyLasso(result: LassoResult): void {
    if (!result) return;
    if ("deselect" in result) this.currentSelection.clear();
    else this.currentSelection.apply(result.shape, result.mode);
  }

  /**
   * Whether a preset comes with the app (it can't be deleted, replaced or exported).
   */
  isBuiltInPreset(id: string): boolean {
    return Object.hasOwn(brushPresets, id);
  }

  /**
   * The handle of the author of presets the user makes (from the `presetAuthor` option), or "" if they have none. Their
   * own presets are the ones with this handle (see `isOwnAuthor`).
   */
  get authorHandle(): string {
    return authorHandle(this.presetAuthor()) ?? "";
  }

  /**
   * Make a new custom preset from settings: a new ID, the given name, and the author from the `presetAuthor` option.
   *
   * @example
   * app.newPreset(app.brush.preset, "My brush"); // { ...settings, id: "0b5c…", name: "My brush", author: { name, handle } }
   */
  newPreset(settings: BrushConfig, name: string): BrushConfig {
    const copy = structuredClone(settings);
    // Families are only for the presets that come with the app
    delete copy.group;
    return {
      ...copy,
      id: crypto.randomUUID(),
      name: name.trim(),
      version: "1.0.0",
      author: this.presetAuthor(),
    };
  }

  /**
   * List the custom presets after the built-in ones, for the brush and the eraser.
   */
  private listCustomPresets(): void {
    const custom = Object.fromEntries(
      this.customPresets.presets.map((preset) => [preset.id, preset]),
    );
    this.brush.setPresets({ ...brushPresets, ...custom });
    this.eraser.setPresets({ ...eraserPresets, ...custom });
    this.tips.preload(custom);
  }

  /** The tool currently in effect: the held tool if a key is held, otherwise the selected tool */
  get activeTool(): Tool {
    return this.heldTool ?? this.tool;
  }

  /** The user's layers */
  get layers(): LayerStack {
    return this.layerStack;
  }

  /** Current foreground colour as a hex string, e.g. `#000000` (the same as `colours.foreground`) */
  get colour(): string {
    return this.currentColours.foreground;
  }

  /** Current foreground and background colours as hex strings, e.g. `{ foreground: "#000000", background: "#ffffff" }` */
  get colours(): Readonly<Record<ColourSlot, string>> {
    return this.currentColours;
  }

  /** Which colour is selected for configuration, e.g. by a colour picker or the colour sample tool ("foreground" by default) */
  get selectedColour(): ColourSlot {
    return this.currentSelectedColour;
  }

  /**
   * Set the foreground colour, or the background colour. Must be a 6-digit hex colour, e.g. `#ff0000`.
   *
   * @example
   * canvas.setColour("#ff0000"); // foreground
   * canvas.setColour("#ffffff", "background");
   */
  setColour(colour: string, slot: ColourSlot = "foreground"): void {
    if (!isHexColour(colour)) throw new Error(`Invalid colour ${colour}`);
    this.currentColours = {
      ...this.currentColours,
      [slot]: colour.toLowerCase(),
    };
    this.notify();
  }

  /**
   * Select which colour is configured, e.g. by a colour picker or the colour sample tool. One colour is always selected.
   *
   * @example
   * canvas.selectColour("background");
   */
  selectColour(slot: ColourSlot): void {
    if (slot === this.currentSelectedColour) return;
    this.currentSelectedColour = slot;
    this.notify();
  }

  /**
   * Swap the foreground and background colours. The selected colour stays the same slot.
   */
  swapColours(): void {
    const { foreground, background } = this.currentColours;
    this.currentColours = { foreground: background, background: foreground };
    this.notify();
  }

  /**
   * Change the canvas size, from 1 to the maximum canvas size (`maxCanvasSize` option). Replaces all layers.
   */
  setCanvasSize(width: number, height: number): void {
    if (
      !this.isValidCanvasDimension(width) ||
      !this.isValidCanvasDimension(height)
    ) {
      throw new Error(
        `Canvas size must be whole numbers from 1 to ${this.maxCanvasSize}`,
      );
    }
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.history.removeEventListener(UNDO_EVENT, this.onHistoryStep);
    this.history.removeEventListener(REDO_EVENT, this.onHistoryStep);
    this.layerStack.removeEventListener("change", this.onLayersOrMaskChange);
    this.currentSelection.removeEventListener(
      "change",
      this.onLayersOrMaskChange,
    );
    this.strokeEngine.removeEventListener(
      BEFORE_COMMIT_EVENT,
      this.onStrokeCommit,
    );
    this.strokeEngine.removeEventListener(
      STROKE_BEGIN_EVENT,
      this.onStrokeBegin,
    );
    this.strokeEngine.removeEventListener(STROKE_END_EVENT, this.onStrokeEnd);
    this.layerStack = new LayerStack(
      width,
      height,
      this.createCanvas,
      this.maxLayers,
    );
    this.view = new Viewport(width, height);
    this.strokeEngine = new StrokeEngine(width, height, this.createCanvas);
    this.currentSelection = new Selection(width, height, this.createCanvas);
    this.transformer = new Transformer(width, height, this.createCanvas);
    this.stopSending();
    this.externalSheets.resize(width, height);
    this.canvasResized(width, height);
    this.clipboard = undefined;
    this.watchLayersAndMask();
    this.notify();
  }

  /**
   * Called when the canvas size changes, before `change` is dispatched. Subclasses resize anything of their own here.
   */
  protected canvasResized(width: number, height: number): void {
    void width;
    void height;
  }

  /**
   * Check a canvas dimension is a whole number from 1 to the maximum canvas size.
   */
  private isValidCanvasDimension(value: number): boolean {
    return Number.isInteger(value) && value >= 1 && value <= this.maxCanvasSize;
  }
  /**
   * Set whether scaling the Move tool's box keeps its proportions.
   */
  setConstrainProportions(constrain: boolean): void {
    this.constrainProportions = constrain;
    this.notify();
  }

  /**
   * Set how the colour sample tool samples.
   */
  setSampleMode(mode: SampleMode): void {
    this.sampleMode = mode;
    this.notify();
  }

  /**
   * Set where the user's pointer is over the canvas (undefined when it leaves). Dispatches `pointer` when it moves.
   */
  setPointer(position: Point | undefined): void {
    if (position?.x === this.pointer?.x && position?.y === this.pointer?.y)
      return;
    this.pointer = position ? { x: position.x, y: position.y } : undefined;
    this.dispatchEvent(new Event("pointer"));
  }

  /**
   * Select a tool.
   *
   * - Clicking a toolbar button (`fromToolbar: true`) only selects the tool: its presets open from the settings bar's
   *   preset button.
   * - Pressing a tool's shortcut selects the tool, or toggles its panel if the tool is already selected.
   *
   * Switching tools closes the previous tool's panel (the layers panel and app menu stay open).
   */
  selectTool(tool: Tool, options: { fromToolbar?: boolean } = {}): void {
    const toolPanel = TOOL_PANELS[tool];
    const alreadySelected = this.tool === tool;
    this.tool = tool;
    if (toolPanel && alreadySelected && !options.fromToolbar) {
      this.panel = this.panel === toolPanel ? null : toolPanel;
    } else if (
      !alreadySelected &&
      this.panel !== Panel.Layers &&
      this.panel !== Panel.Menu
    ) {
      this.panel = null;
    }
    this.syncTransform();
    this.notify();
  }

  /**
   * Use a tool temporarily while a key is held (e.g. Space for pan). The selected tool is unchanged.
   */
  holdTool(tool: Tool): void {
    if (this.heldTool === tool) return;
    this.heldTool = tool;
    this.notify();
  }

  /**
   * Stop using the held tool and return to the selected tool.
   */
  releaseHeldTool(): void {
    if (this.heldTool === null) return;
    this.heldTool = null;
    this.notify();
  }

  /**
   * Close the open panel, if any.
   */
  closePanel(): void {
    if (this.panel === null) return;
    this.panel = null;
    this.notify();
  }

  /**
   * Open a panel, or close it if already open.
   */
  togglePanel(panel: Panel): void {
    this.panel = this.panel === panel ? null : panel;
    this.notify();
  }

  /**
   * Show or hide the interface.
   */
  toggleInterface(): void {
    this.interfaceVisible = !this.interfaceVisible;
    this.notify();
  }

  /**
   * Dispatch a `change` event.
   */
  protected notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
