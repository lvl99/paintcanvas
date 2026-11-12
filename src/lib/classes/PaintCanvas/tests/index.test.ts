import { describe, it, expect, vi } from "vitest";
import { DEFAULT_PALETTE } from "../../../palette";
import PaintCanvas, { MAX_CANVAS_SIZE, Panel, Tool } from "..";
import {
  BEFORE_COMMIT_EVENT,
  STROKE_BEGIN_EVENT,
  STROKE_END_EVENT,
} from "../../../brushes/StrokeEngine";
import {
  createFakeCanvasFactory,
  fakeContext,
} from "../../../../testing/fakeCanvas";
import { MemoryLayerStore } from "../../../../testing/layerStore";
import { AutosaveState } from "../../LayerAutosave";
import { BlendMode } from "../../Layer";
import { MemoryDocumentStore } from "../../../../testing/documentStore";

const createApp = (options = {}) =>
  new PaintCanvas({ createCanvas: createFakeCanvasFactory(), ...options });

describe("PaintCanvas", () => {
  it("should keep assets in memory, allow canvases up to the maximum size and use a default preset author", () => {
    const app = createApp();
    expect(app.assetStores).toEqual({});
    expect(app.profileSync).toBeUndefined();
    expect(app.authorHandle).toBe("");
    expect(app.maxCanvasSize).toBe(MAX_CANVAS_SIZE);
    expect(app.maxLayers).toBe(5);
    expect(app.newPreset({ id: "round10" }, "Mine").author).toEqual({
      name: "Unknown",
    });
    expect(app.drawables).toEqual(app.layers.layers);
    expect(app.names).toEqual({
      app: "PaintCanvas",
      filePrefix: "paintcanvas",
      unknownAuthor: "Unknown",
    });
  });

  it("should use the names given instead of its own", () => {
    expect(createApp({ names: { app: "My App" } }).names).toEqual({
      app: "My App",
      filePrefix: "paintcanvas",
      unknownAuthor: "Unknown",
    });
  });

  it("should use the given maximum canvas size and preset author", () => {
    const app = createApp({
      maxCanvasSize: 500,
      maxLayers: 2,
      presetAuthor: () => ({ name: "Ada", handle: "ada" }),
    });
    expect(app.authorHandle).toBe("ada");
    expect(app.author).toEqual({ name: "Ada", handle: "ada" });
    expect(app.layers.maxLayers).toBe(2);
    app.setCanvasSize(100, 100);
    expect(app.layers.maxLayers).toBe(2);
    expect(app.newPreset({ id: "round10" }, "Mine").author).toEqual({
      name: "Ada",
      handle: "ada",
    });
    expect(() => app.setCanvasSize(501, 10)).toThrow(
      "Canvas size must be whole numbers from 1 to 500",
    );
  });

  it("should record finished strokes for undo, and forget them when the canvas is resized", () => {
    const app = createApp();
    const area = { x: 1, y: 2, width: 3, height: 4 };
    const commit = (engine = app.strokes) =>
      engine.dispatchEvent(
        new CustomEvent(BEFORE_COMMIT_EVENT, {
          detail: { layer: app.layers.active, area },
        }),
      );
    commit();
    expect(app.history.canUndo).toBe(true);
    const oldEngine = app.strokes;
    app.setCanvasSize(300, 200);
    expect(app.history.canUndo).toBe(false);
    commit(oldEngine);
    expect(app.history.canUndo).toBe(false);
    commit();
    expect(app.history.canUndo).toBe(true);
  });

  it("should record strokes only while the debug log shows", () => {
    const app = createApp();
    const listener = vi.fn();
    app.addEventListener("change", listener);
    expect([app.debugLog, app.strokeLog.enabled]).toEqual([false, false]);
    app.showDebugLog(true);
    expect([app.debugLog, app.strokeLog.enabled]).toEqual([true, true]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should change how the colour sample tool samples and whether scaling keeps proportions", () => {
    const app = createApp();
    const listener = vi.fn();
    app.addEventListener("change", listener);
    app.setSampleMode("area");
    app.setConstrainProportions(true);
    expect([app.sampleMode, app.constrainProportions]).toEqual(["area", true]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should use default settings", () => {
    const app = createApp();
    expect([app.width, app.height]).toEqual([2000, 2000]);
    expect(app.layers.active.width).toBe(2000);
    expect(app.tool).toBe(Tool.Brush);
    expect(app.panel).toBeNull();
    expect(app.colour).toBe("#000000");
    expect(app.colours).toEqual({
      foreground: "#000000",
      background: "#ffffff",
    });
    expect(app.selectedColour).toBe("foreground");
    expect(app.palette.colours).toEqual(DEFAULT_PALETTE);
    expect(app.interfaceVisible).toBe(true);
    expect(app.brush.preset).not.toBe(app.eraser.preset);
  });

  it("should create real canvases that keep their pixels in regular memory by default", () => {
    const options: unknown[] = [];
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext(_type: string, settings?: unknown) {
          options.push(settings);
          return {};
        }
      },
    );
    expect(new PaintCanvas().layers.active.canvas).toBeInstanceOf(
      OffscreenCanvas,
    );
    expect(options[0]).toEqual({ willReadFrequently: true });
    vi.unstubAllGlobals();
  });

  it("should draw where asked, starting the user's choice there", () => {
    const options: unknown[] = [];
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext(_type: string, settings?: unknown) {
          options.push(settings);
          return {};
        }
      },
    );
    const cpu = new PaintCanvas();
    expect([cpu.rendering, cpu.ui.data.rendering]).toEqual(["cpu", "cpu"]);
    options.length = 0;
    const gpu = new PaintCanvas({ rendering: "gpu" });
    expect([gpu.rendering, gpu.ui.data.rendering]).toEqual(["gpu", "gpu"]);
    // Canvases on the GPU get no context until drawn on
    expect(options).toEqual([]);
    gpu.ui.update({ rendering: "cpu" });
    expect(gpu.rendering).toBe("gpu");
    vi.unstubAllGlobals();
  });

  it("should accept a canvas size option", () => {
    expect(createApp({ width: 800 })).toMatchObject({
      width: 800,
      height: 2000,
    });
    expect(createApp({ height: 600 })).toMatchObject({
      width: 2000,
      height: 600,
    });
  });

  it("should hold background work during strokes, following the stroke engine after the canvas is resized", () => {
    const app = createApp();
    const task = vi.fn();
    const oldEngine = app.strokes;
    app.setCanvasSize(300, 200);
    // The old engine's strokes no longer hold work
    oldEngine.dispatchEvent(new Event(STROKE_BEGIN_EVENT));
    app.background.run("map", task);
    expect(task).toHaveBeenCalledOnce();
    app.strokes.dispatchEvent(new Event(STROKE_BEGIN_EVENT));
    app.background.run("map", task);
    expect(app.background.pending).toEqual(["map"]);
    app.strokes.dispatchEvent(new Event(STROKE_END_EVENT));
    oldEngine.dispatchEvent(new Event(STROKE_END_EVENT));
    expect(app.background.pending).toEqual(["map"]);
  });

  it("should replace layers when the canvas size changes", () => {
    const app = createApp();
    app.setCanvasSize(300, 200);
    expect(app.layers.active.width).toBe(300);
    expect(app.layers.active.height).toBe(200);
  });

  it.each([
    [0, 10],
    [10, MAX_CANVAS_SIZE + 1],
    [1.5, 10],
  ])("should reject canvas size %d x %d", (width, height) => {
    expect(() => createApp().setCanvasSize(width, height)).toThrow(
      "Canvas size must be whole numbers",
    );
  });

  it("should validate and normalise colours", () => {
    const app = createApp();
    app.setColour("#FF00AA");
    expect(app.colour).toBe("#ff00aa");
    expect(() => app.setColour("red")).toThrow("Invalid colour red");
    app.setColour("#00FF00", "background");
    expect(app.colours).toEqual({
      foreground: "#ff00aa",
      background: "#00ff00",
    });
    expect(() => app.setColour("#fff", "background")).toThrow(
      "Invalid colour #fff",
    );
  });

  it("should select which colour is configured and swap the colours, dispatching a change", () => {
    const app = createApp();
    const listener = vi.fn();
    app.addEventListener("change", listener);
    app.selectColour("background");
    expect(app.selectedColour).toBe("background");
    app.selectColour("background");
    expect(listener).toHaveBeenCalledTimes(1);
    app.setColour("#123456");
    app.swapColours();
    expect(app.colours).toEqual({
      foreground: "#ffffff",
      background: "#123456",
    });
    expect(app.colour).toBe("#ffffff");
    expect(app.selectedColour).toBe("background");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("should only select a tool from the toolbar, without opening or closing its panel", () => {
    const app = createApp();
    app.selectTool(Tool.Eraser, { fromToolbar: true });
    expect([app.tool, app.panel]).toEqual([Tool.Eraser, null]);
    app.selectTool(Tool.Eraser, { fromToolbar: true });
    expect(app.panel).toBeNull();
    app.togglePanel(Panel.Eraser);
    app.selectTool(Tool.Eraser, { fromToolbar: true });
    expect(app.panel).toBe(Panel.Eraser);
    // Switching tools still closes the previous tool's panel
    app.selectTool(Tool.Brush, { fromToolbar: true });
    expect(app.panel).toBeNull();
  });

  it("should select a tool by shortcut, then toggle its panel on the next presses", () => {
    const app = createApp();
    app.selectTool(Tool.Eraser);
    expect([app.tool, app.panel]).toEqual([Tool.Eraser, null]);
    app.selectTool(Tool.Eraser);
    expect(app.panel).toBe(Panel.Eraser);
    app.selectTool(Tool.Eraser);
    expect(app.panel).toBeNull();
  });

  it("should close a tool panel when switching tools but keep the layers panel open", () => {
    const app = createApp();
    app.togglePanel(Panel.Brush);
    app.selectTool(Tool.Zoom);
    expect(app.panel).toBeNull();

    app.togglePanel(Panel.Menu);
    app.selectTool(Tool.Eraser);
    expect(app.panel).toBe(Panel.Menu);

    app.togglePanel(Panel.Layers);
    app.selectTool(Tool.Pan);
    expect(app.panel).toBe(Panel.Layers);
    app.selectTool(Tool.Pan);
    expect(app.panel).toBe(Panel.Layers);
  });

  it("should toggle panels and interface visibility", () => {
    const app = createApp();
    const listener = vi.fn();
    app.addEventListener("change", listener);
    app.togglePanel(Panel.Menu);
    expect(app.panel).toBe(Panel.Menu);
    app.togglePanel(Panel.Menu);
    expect(app.panel).toBeNull();
    app.toggleInterface();
    expect(app.interfaceVisible).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("should report the user's pointer only when it moves", () => {
    const app = createApp();
    const listener = vi.fn();
    app.addEventListener("pointer", listener);
    app.setPointer({ x: 1, y: 2 });
    app.setPointer({ x: 1, y: 2 });
    expect(app.pointer).toEqual({ x: 1, y: 2 });
    app.setPointer(undefined);
    app.setPointer(undefined);
    expect(app.pointer).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should create a viewport for the canvas size and replace it when the size changes", () => {
    const app = createApp();
    expect([app.viewport.canvasWidth, app.viewport.canvasHeight]).toEqual([
      2000, 2000,
    ]);
    const old = app.viewport;
    app.setCanvasSize(300, 200);
    expect(app.viewport).not.toBe(old);
    expect([app.viewport.canvasWidth, app.viewport.canvasHeight]).toEqual([
      300, 200,
    ]);
  });

  it("should use a held tool until it is released", () => {
    const app = createApp();
    const listener = vi.fn();
    app.addEventListener("change", listener);
    app.holdTool(Tool.Pan);
    app.holdTool(Tool.Pan);
    expect([app.tool, app.activeTool]).toEqual([Tool.Brush, Tool.Pan]);
    app.releaseHeldTool();
    app.releaseHeldTool();
    expect(app.activeTool).toBe(Tool.Brush);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should create a stroke engine for the canvas size and replace it when the size changes", () => {
    const app = createApp();
    expect([app.strokes.width, app.strokes.height]).toEqual([2000, 2000]);
    app.setCanvasSize(300, 200);
    expect([app.strokes.width, app.strokes.height]).toEqual([300, 200]);
    expect(app.tips.get({ id: "round" }).isRound).toBe(true);
  });

  it("should close the open panel", () => {
    const app = createApp();
    const listener = vi.fn();
    app.addEventListener("change", listener);
    app.closePanel();
    expect(listener).not.toHaveBeenCalled();
    app.togglePanel(Panel.Layers);
    app.closePanel();
    expect(app.panel).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should apply lasso results to the selection and replace it when the size changes", () => {
    const app = createApp();
    const apply = vi
      .spyOn(app.selection, "apply")
      .mockImplementation(() => undefined);
    const clear = vi
      .spyOn(app.selection, "clear")
      .mockImplementation(() => undefined);
    const shape = {
      type: "rect" as const,
      rect: { x: 0, y: 0, width: 1, height: 1 },
    };
    app.applyLasso(undefined);
    app.applyLasso({ shape, mode: "add" });
    app.applyLasso({ deselect: true });
    expect(apply).toHaveBeenCalledWith(shape, "add");
    expect(clear).toHaveBeenCalledOnce();
    const old = app.selection;
    app.setCanvasSize(50, 50);
    expect(app.selection).not.toBe(old);
    expect(app.selection.width).toBe(50);
  });

  it("should list custom presets after the built-in ones for the brush and eraser", async () => {
    const saved = {
      id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
      name: "Mine",
      image: "data:image/png;base64,AAAA",
    };
    const store = {
      list: vi.fn(async () => [saved]),
      put: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const app = new PaintCanvas({
      stores: { brushes: store },
      createCanvas: createFakeCanvasFactory(),
    });
    await vi.waitFor(() => expect(app.brush.presets[saved.id]).toEqual(saved));
    expect(app.eraser.presets[saved.id]).toEqual(saved);
    expect(Object.keys(app.brush.presets)[0]).toBe("round1");
    expect(app.isBuiltInPreset("round1")).toBe(true);
    expect(app.isBuiltInPreset(saved.id)).toBe(false);
  });

  it("should keep profile graphs in their store, and use other stores", async () => {
    const graph = {
      id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
      name: "Soft",
      points: [
        { x: 0, y: -10, i: "linear" },
        { x: 10, y: 0, i: "linear" },
      ],
    };
    const store = () => ({
      list: vi.fn(async (): Promise<unknown[]> => [graph]),
      put: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    });
    const profiles = store();
    const palette = { id: graph.id, name: "Sunset", colours: ["#ff7700"] };
    const palettes = store();
    palettes.list.mockResolvedValue([palette]);
    const app = createApp({ stores: { profiles, palettes } });
    expect(app.assetStores.profiles).toBe(profiles);
    await app.profileSync?.ready;
    await app.paletteSync?.ready;
    expect(app.profiles.graphs).toEqual([graph]);
    expect(app.palettes.items).toEqual([palette]);
    const changed = vi.fn();
    app.addEventListener("change", changed);
    const brushes = store();
    brushes.list.mockResolvedValue([]);
    app.useAssetStores({ brushes });
    expect(app.profileSync).toBeUndefined();
    expect(app.paletteSync).toBeUndefined();
    expect(app.assetStores).toEqual({ brushes });
    expect(changed).toHaveBeenCalled();
    app.profiles.remove(graph.id);
    expect(profiles.remove).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(brushes.list).toHaveBeenCalled());
  });

  it("should keep the drawing in a remote store, replacing or stopping the one before", () => {
    const store = new MemoryDocumentStore();
    const app = createApp({ remoteDocumentStore: store });
    const first = app.remoteAutosave!;
    expect(first.store).toBe(store);
    const stop = vi.spyOn(first, "stop");
    const changed = vi.fn();
    app.addEventListener("change", changed);
    const other = new MemoryDocumentStore();
    expect(app.useRemoteDocumentStore(other, { intervalMs: 10 })?.store).toBe(
      other,
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
    expect(app.useRemoteDocumentStore(undefined)).toBeUndefined();
    expect(app.remoteAutosave).toBeUndefined();
  });

  it("should keep working when custom presets can't be loaded", async () => {
    const store = {
      list: vi.fn(async () => {
        throw new Error("blocked");
      }),
      put: vi.fn(),
      remove: vi.fn(),
    };
    const app = new PaintCanvas({
      stores: { brushes: store },
      createCanvas: createFakeCanvasFactory(),
    });
    await vi.waitFor(() => expect(store.list).toHaveBeenCalled());
    expect(app.customPresets.presets).toEqual([]);
  });

  it("should restore layers: the size, each layer's settings and image, and the selected one, starting undo history again", () => {
    const app = createApp();
    app.layers.create();
    expect(app.history.canUndo).toBe(true);
    const images = [{}, {}] as CanvasImageSource[];
    app.restoreLayers(
      30,
      20,
      [
        { id: "top", name: "Ink", blendMode: BlendMode.Screen, opacity: 0.5 },
        { id: "bottom", name: "Sketch", visible: false },
      ],
      images,
      "bottom",
    );
    expect([app.width, app.height]).toEqual([30, 20]);
    expect(app.layers.layers.map((layer) => layer.toConfig())).toEqual([
      {
        id: "top",
        name: "Ink",
        blendMode: BlendMode.Screen,
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
        alphaLock: false,
      },
    ]);
    app.layers.layers.forEach((layer, i) =>
      expect(fakeContext(layer.canvas).drawImage).toHaveBeenCalledWith(
        images[i],
        0,
        0,
      ),
    );
    expect(app.layers.active.id).toBe("bottom");
    expect(app.history.canUndo).toBe(false);
    // More layers than allowed: nothing changes
    expect(() =>
      createApp({ maxLayers: 1 }).restoreLayers(
        30,
        20,
        [{ name: "A" }, { name: "B" }],
        images,
        "a",
      ),
    ).toThrow("Cannot have more than 1 layers");
  });

  it("should keep its layers in a store when given one, and change or stop using stores", async () => {
    const store = new MemoryLayerStore();
    const app = createApp({ layerStore: store });
    expect(app.autosave?.store).toBe(store);
    const changes = vi.fn();
    app.addEventListener("change", changes);
    const first = app.autosave;
    const other = new MemoryLayerStore("other");
    const autosave = app.useLayerStore(other, { locks: null, document: null });
    expect(autosave).toBe(app.autosave);
    expect(autosave?.store).toBe(other);
    await vi.waitFor(() => expect(first?.state).toBe(AutosaveState.Stopped));
    expect(app.useLayerStore(undefined)).toBeUndefined();
    expect(app.autosave).toBeUndefined();
    await vi.waitFor(() => expect(autosave?.state).toBe(AutosaveState.Stopped));
    expect(changes).toHaveBeenCalledTimes(2);
    expect(createApp().autosave).toBeUndefined();
  });
});
