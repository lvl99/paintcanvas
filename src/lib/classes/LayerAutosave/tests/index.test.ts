import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import LayerAutosave, {
  AUTOSAVE_ERROR_EVENT,
  AutosaveState,
  SAVE_DELAY_MS,
  type AutosaveOptions,
} from "..";
import PaintCanvas from "../../PaintCanvas";
import type Layer from "../../Layer";
import { BlendMode } from "../../Layer";
import { SAVED_DRAWING_VERSION, type SavedDrawing } from "../../../storage";
import { MemoryLayerStore } from "../../../../testing/layerStore";
import { createFakeLocks } from "../../../../testing/locks";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";
import { events } from "../../../../testing/elements";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A small canvas whose layers record drawing calls */
const createCanvas = (maxLayers?: number) =>
  new PaintCanvas({
    width: 4,
    height: 2,
    maxLayers,
    createCanvas: createRecordingCanvasFactory().factory,
  });

/** Give a layer's pixels a value (each byte), as if drawn on */
const paint = (layer: Layer, value: number) => {
  (layer.context as unknown as Record<string, unknown>).getImageData = (
    _x: number,
    _y: number,
    width: number,
    height: number,
  ) => ({ data: new Uint8ClampedArray(width * height * 4).fill(value) });
};

/** A layer's "PNG": the value its pixels have */
const encode = vi.fn(
  async (canvas: OffscreenCanvas) =>
    new Blob([
      String(
        (
          canvas.getContext("2d") as OffscreenCanvasRenderingContext2D
        ).getImageData(0, 0, 1, 1).data[0],
      ),
    ]),
);

/** A saved "PNG" as the image drawn: the blob itself */
const decode = async (image: Blob) => image as unknown as CanvasImageSource;

/** Start autosaving a canvas, without locks or a page, saving as soon as the layers change */
const setup = (
  store = new MemoryLayerStore(),
  options: AutosaveOptions = {},
  canvas = createCanvas(),
) => {
  const autosave = new LayerAutosave(canvas, store, {
    locks: null,
    document: null,
    encode,
    decode,
    delayMs: 0,
    ...options,
  });
  autosave.start();
  return { canvas, store, autosave };
};

/** Let saving and loading finish */
const settle = () => vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

/** The IDs of the images in a save */
const imageIds = (save: { images: Map<string, Blob> } | undefined) => [
  ...(save?.images.keys() ?? []),
];

/** A saved drawing of 2 layers, 3 × 5 pixels, with the bottom one selected */
const savedDrawing = (): SavedDrawing => ({
  version: SAVED_DRAWING_VERSION,
  width: 3,
  height: 5,
  layers: [
    {
      id: "top",
      name: "Ink",
      blendMode: BlendMode.Multiply,
      opacity: 0.5,
      visible: true,
      alphaLock: false,
    },
    {
      id: "bottom",
      name: "Sketch",
      blendMode: BlendMode.Normal,
      opacity: 1,
      visible: false,
      alphaLock: true,
    },
  ],
  activeLayer: "bottom",
});

/** A store with the saved drawing of 2 layers */
const savedStore = (name = "test") => {
  const images = new Map([
    ["top", new Blob(["ink"])],
    ["bottom", new Blob(["sketch"])],
  ]);
  return {
    store: new MemoryLayerStore(name, { drawing: savedDrawing(), images }),
    images,
  };
};

/** A fake page whose visibility can change */
const createPage = () => {
  const page = new EventTarget() as EventTarget & {
    visibilityState: DocumentVisibilityState;
  };
  page.visibilityState = "visible";
  const show = (state: DocumentVisibilityState) => {
    page.visibilityState = state;
    page.dispatchEvent(new Event("visibilitychange"));
  };
  return { page, show };
};

describe("LayerAutosave", () => {
  it("should save the drawing when nothing was saved, then only the layers whose pixels changed", async () => {
    const { canvas, store, autosave } = setup();
    expect(autosave.state).toBe(AutosaveState.Starting);
    await settle();
    expect(autosave.state).toBe(AutosaveState.Ready);
    const first = canvas.layers.active;
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0]?.drawing).toEqual({
      version: SAVED_DRAWING_VERSION,
      width: 4,
      height: 2,
      layers: [first.toConfig()],
      activeLayer: first.id,
    });
    expect(imageIds(store.saves[0])).toEqual([first.id]);

    // A stroke on a layer
    paint(first, 9);
    canvas.layers.markChanged(first.id);
    await settle();
    expect(imageIds(store.saves[1])).toEqual([first.id]);
    expect(await store.saves[1]?.images.get(first.id)?.text()).toBe("9");

    // A new layer: only it is new; the other's pixels didn't change
    const second = canvas.layers.create();
    await settle();
    expect(imageIds(store.saves[2])).toEqual([second.id]);

    // Settings only: no images
    canvas.layers.rename(first.id, "Renamed");
    await settle();
    expect(imageIds(store.saves[3])).toEqual([]);
    expect(store.saves[3]?.drawing.layers[1]?.name).toBe("Renamed");

    // A layer that's gone, then pixels changing back to how they were last saved
    canvas.layers.remove(second.id);
    paint(first, 9);
    await settle();
    expect(store.saves[4]?.drawing.layers.map((layer) => layer.id)).toEqual([
      first.id,
    ]);
    expect(imageIds(store.saves[4])).toEqual([]);
    expect(encode).toHaveBeenCalledTimes(3);
  });

  it("should wait for the layers to stop changing and for drawing to pause before saving", async () => {
    const { canvas, store } = setup(undefined, { delayMs: SAVE_DELAY_MS });
    await settle();
    expect(store.saves).toHaveLength(1);
    canvas.layers.rename(canvas.layers.active.id, "A");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS / 2);
    canvas.layers.rename(canvas.layers.active.id, "B");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS / 2);
    expect(store.saves).toHaveLength(1);
    canvas.background.strokeStarted();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saves).toHaveLength(1);
    canvas.background.strokeEnded();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.saves).toHaveLength(2);
    expect(store.saves[1]?.drawing.layers[0]?.name).toBe("B");
  });

  it("should restore a saved drawing, not saving it again until it changes", async () => {
    const { store, images } = savedStore();
    const { canvas, autosave } = setup(store);
    await settle();
    expect(autosave.state).toBe(AutosaveState.Ready);
    expect([canvas.width, canvas.height]).toEqual([3, 5]);
    expect(canvas.layers.layers.map((layer) => layer.toConfig())).toEqual(
      savedDrawing().layers,
    );
    expect(canvas.layers.active.id).toBe("bottom");
    expect(store.saves).toHaveLength(0);
    expect(canvas.history.canUndo).toBe(false);

    paint(canvas.layers.get("top"), 3);
    canvas.layers.markChanged("top");
    await settle();
    expect(imageIds(store.saves[0])).toEqual(["top"]);
    expect(store.saved?.images.get("bottom")).toBe(images.get("bottom"));
  });

  it("should draw each saved image onto its layer", async () => {
    const { factory, created } = createRecordingCanvasFactory();
    const canvas = new PaintCanvas({ createCanvas: factory });
    const { store, images } = savedStore();
    setup(store, {}, canvas);
    await settle();
    const drawnImages = created
      .flatMap(({ calls }) => calls)
      .filter(([name]) => name === "drawImage")
      .map(([, image]) => image);
    expect(drawnImages).toEqual([images.get("top"), images.get("bottom")]);
  });

  it("should stop, without saving over it, when the saved drawing can't be loaded or restored", async () => {
    const failing = new MemoryLayerStore();
    failing.loadError = new Error("Can't read");
    const incomplete = savedStore().store;
    incomplete.saved?.images.delete("top");
    const otherVersion = savedStore().store;
    (otherVersion.saved as { drawing: SavedDrawing }).drawing.version = 99;
    const noLayers = savedStore().store;
    (noLayers.saved as { drawing: SavedDrawing }).drawing.layers = [];
    const unselected = savedStore().store;
    (unselected.saved as { drawing: SavedDrawing }).drawing.activeLayer =
      "gone";
    const undecodable = savedStore().store;
    for (const [store, options, canvas] of [
      [failing, {}, createCanvas()],
      [incomplete, {}, createCanvas()],
      [otherVersion, {}, createCanvas()],
      [noLayers, {}, createCanvas()],
      [unselected, {}, createCanvas()],
      [
        undecodable,
        { decode: () => Promise.reject(new Error("Not a PNG")) },
        createCanvas(),
      ],
      // Too many layers for the canvas
      [savedStore().store, {}, createCanvas(1)],
    ] as const) {
      const autosave = new LayerAutosave(canvas, store, {
        locks: null,
        document: null,
        encode,
        decode,
        delayMs: 0,
        ...options,
      });
      const errors = events(autosave, AUTOSAVE_ERROR_EVENT);
      autosave.start();
      await settle();
      expect(autosave.state).toBe(AutosaveState.Stopped);
      expect(errors).toHaveLength(1);
      expect(autosave.error).toBeInstanceOf(Error);
      canvas.layers.rename(canvas.layers.active.id, "Changed");
      await settle();
      expect(store.saves).toHaveLength(0);
    }
  });

  it("should report a failed save, and save the same layers with the next one", async () => {
    const store = new MemoryLayerStore();
    store.saveError = new Error("Disk full");
    const { canvas, autosave } = setup(store);
    const errors = events(autosave, AUTOSAVE_ERROR_EVENT);
    await settle();
    expect(errors).toEqual([store.saveError]);
    expect(autosave.error).toBe(store.saveError);
    expect(autosave.state).toBe(AutosaveState.Ready);
    store.saveError = undefined;
    canvas.layers.rename(canvas.layers.active.id, "Again");
    await settle();
    expect(imageIds(store.saves[0])).toEqual([canvas.layers.active.id]);
    expect(autosave.error).toBeUndefined();
  });

  it("should report an encoder that throws, and check the same layers again with the next save", async () => {
    let throws = true;
    const { canvas, store, autosave } = setup(undefined, {
      encode: (canvas) => {
        if (throws) throw new Error("Can't encode");
        return encode(canvas);
      },
    });
    const errors = events(autosave, AUTOSAVE_ERROR_EVENT);
    await settle();
    expect(errors).toHaveLength(1);
    expect(store.saves).toHaveLength(0);
    // A stroke's save fails too, then the next save has both
    const first = canvas.layers.active;
    const second = canvas.layers.create();
    throws = false;
    await settle();
    throws = true;
    paint(first, 5);
    canvas.layers.markChanged(first.id);
    await settle();
    expect(errors).toHaveLength(2);
    throws = false;
    paint(second, 6);
    canvas.layers.markChanged(second.id);
    await settle();
    expect(imageIds(store.saves.at(-1)).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it("should save again after the save being written, when asked meanwhile", async () => {
    const { canvas, store, autosave } = setup();
    await settle();
    const first = autosave.save();
    canvas.layers.rename(canvas.layers.active.id, "Meanwhile");
    expect(autosave.save()).toBe(first);
    await settle();
    expect(store.saves.map((save) => save.drawing.layers[0]?.name)).toEqual([
      "Layer 1",
      "Layer 1",
      "Meanwhile",
    ]);
  });

  it("should follow the canvas's new layers when its size changes", async () => {
    const { canvas, store } = setup();
    await settle();
    canvas.setCanvasSize(6, 3);
    await settle();
    expect(store.saves[1]?.drawing).toMatchObject({ width: 6, height: 3 });
    expect(imageIds(store.saves[1])).toEqual([canvas.layers.active.id]);
    // Other changes to the canvas don't save
    canvas.setColour("#ff0000");
    await settle();
    expect(store.saves).toHaveLength(2);
  });

  it("should stop: save what changed, then let go of the drawing and save nothing more", async () => {
    const { locks, isHeld } = createFakeLocks();
    const { canvas, store, autosave } = setup(undefined, { locks });
    await settle();
    expect(isHeld(autosave.lockName)).toBe(true);
    canvas.layers.rename(canvas.layers.active.id, "Last");
    await autosave.stop();
    expect(autosave.state).toBe(AutosaveState.Stopped);
    expect(store.saves.at(-1)?.drawing.layers[0]?.name).toBe("Last");
    await settle();
    expect(isHeld(autosave.lockName)).toBe(false);
    canvas.layers.rename(canvas.layers.active.id, "Ignored");
    await settle();
    await autosave.stop();
    expect(store.saves).toHaveLength(2);
    await expect(autosave.save()).resolves.toBeUndefined();
  });

  it("should do nothing when started after stopping, with or without locks", async () => {
    for (const locks of [null, createFakeLocks().locks]) {
      const store = new MemoryLayerStore();
      const autosave = new LayerAutosave(createCanvas(), store, {
        locks,
        document: null,
      });
      await autosave.stop();
      autosave.start();
      await settle();
      expect(autosave.state).toBe(AutosaveState.Stopped);
      expect(store.saves).toHaveLength(0);
    }
  });

  it("should stop loading and restoring when stopped meanwhile", async () => {
    let loaded!: () => void;
    const slow = savedStore().store;
    const load = slow.load.bind(slow);
    slow.load = () =>
      new Promise((resolve) => (loaded = () => resolve(load())));
    const loading = setup(slow).autosave;
    await loading.stop();
    loaded();
    await settle();
    expect(loading.state).toBe(AutosaveState.Stopped);

    let decoded!: () => void;
    const restoring = setup(savedStore().store, {
      decode: (image) =>
        new Promise((resolve) => (decoded = () => resolve(image as never))),
    });
    await settle();
    const canvas = restoring.canvas;
    await restoring.autosave.stop();
    decoded();
    await settle();
    expect(restoring.autosave.state).toBe(AutosaveState.Stopped);
    expect(canvas.width).toBe(4);
  });

  it("should wait while another window has the drawing, and take it over", async () => {
    const { locks, isHeld } = createFakeLocks();
    const first = setup(new MemoryLayerStore("shared"), { locks });
    await settle();
    first.canvas.layers.rename(first.canvas.layers.active.id, "From first");
    await settle();
    const second = setup(
      first.store as MemoryLayerStore,
      { locks },
      createCanvas(),
    );
    await settle();
    expect(second.autosave.state).toBe(AutosaveState.Elsewhere);
    expect(second.canvas.layers.active.name).toBe("Layer 1");

    const changes = events(first.autosave, "change");
    second.autosave.takeOver();
    await settle();
    expect(second.autosave.state).toBe(AutosaveState.Ready);
    expect(second.canvas.layers.active.name).toBe("From first");
    expect(first.autosave.state).toBe(AutosaveState.Elsewhere);
    expect(changes).toHaveLength(1);
    expect(isHeld(second.autosave.lockName)).toBe(true);

    // The first window doesn't save any more, nor take over unless asked
    const saves = first.store.saves.length;
    first.canvas.layers.rename(first.canvas.layers.active.id, "Stale");
    await settle();
    expect(first.store.saves).toHaveLength(saves);
    second.autosave.takeOver();
    await settle();
    expect(second.autosave.state).toBe(AutosaveState.Ready);
  });

  it("should not save a save under way once another window takes the drawing over", async () => {
    const { locks } = createFakeLocks();
    let encoded!: () => void;
    const first = setup(new MemoryLayerStore("shared"), {
      locks,
      encode: (canvas) =>
        new Promise((resolve) => {
          encoded = () => resolve(encode(canvas));
        }),
    });
    // The first save waits to be encoded
    await settle();
    const second = setup(first.store, { locks });
    second.autosave.takeOver();
    await settle();
    encoded();
    await settle();
    expect(first.autosave.state).toBe(AutosaveState.Elsewhere);
    // Only the second window's save
    expect(first.store.saves).toHaveLength(1);
  });

  it("should try again when the page is shown, and save straight away when it's hidden", async () => {
    const { locks } = createFakeLocks();
    const first = createPage();
    const second = createPage();
    const a = setup(new MemoryLayerStore("shared"), {
      locks,
      document: first.page,
      delayMs: SAVE_DELAY_MS,
    });
    const b = setup(a.store, { locks, document: second.page });
    await settle();
    expect(b.autosave.state).toBe(AutosaveState.Elsewhere);

    // Hidden: changes are saved now
    a.canvas.layers.rename(a.canvas.layers.active.id, "Before hiding");
    first.show("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(a.store.saves.at(-1)?.drawing.layers[0]?.name).toBe("Before hiding");

    // Shown again while drawing: nothing changes
    first.show("visible");
    expect(a.autosave.state).toBe(AutosaveState.Ready);

    // Shown while the other window still has it: still waiting
    second.show("visible");
    await settle();
    expect(b.autosave.state).toBe(AutosaveState.Elsewhere);

    // The first window closes; the second takes the drawing when shown
    await a.autosave.stop();
    await settle();
    second.show("hidden");
    second.show("visible");
    await settle();
    expect(b.autosave.state).toBe(AutosaveState.Ready);
    expect(b.canvas.layers.active.name).toBe("Before hiding");
    // A stopped autosave no longer follows its page
    first.show("visible");
    expect(a.autosave.state).toBe(AutosaveState.Stopped);
  });

  it("should draw without a lock where locks can't be used", async () => {
    const { autosave } = setup(undefined, {
      locks: createFakeLocks(true).locks,
    });
    await settle();
    expect(autosave.state).toBe(AutosaveState.Ready);
  });

  it("should use the browser's locks and page, and encode and decode PNGs, by default", async () => {
    const request = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("navigator", { locks: { request } });
    const listen = vi.spyOn(document, "addEventListener");
    const autosave = new LayerAutosave(createCanvas(), new MemoryLayerStore());
    autosave.start();
    expect(request).toHaveBeenCalledWith(
      "paintcanvas:test",
      { ifAvailable: true },
      expect.any(Function),
    );
    expect(listen).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    // Without the browser's locks or page
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("document", undefined);
    const bitmap = {} as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );
    const blob = new Blob(["png"]);
    const canvas = createCanvas();
    const { store } = savedStore();
    const plain = new LayerAutosave(canvas, store);
    plain.start();
    await settle();
    expect(plain.state).toBe(AutosaveState.Ready);
    expect(createImageBitmap).toHaveBeenCalledWith(
      store.saved?.images.get("top"),
    );
    // Encoding: the canvas gets a context first (one never drawn on has none)
    const layerCanvas = canvas.layers.get("top").canvas;
    const png = {
      getContext: vi.fn((type: "2d") => layerCanvas.getContext(type)),
      convertToBlob: vi.fn(async () => blob),
    };
    Object.assign(canvas.layers.get("top"), { canvas: png });
    paint(canvas.layers.get("top"), 1);
    canvas.layers.markChanged("top");
    await settle();
    expect(png.getContext).toHaveBeenCalledWith("2d");
    expect(png.convertToBlob).toHaveBeenCalledWith({ type: "image/png" });
    expect(store.saves[0]?.images.get("top")).toBe(blob);
    vi.unstubAllGlobals();
  });
});
