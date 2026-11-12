import { describe, it, expect, vi, afterEach } from "vitest";
import SettingsAutosave, {
  SETTINGS_AUTOSAVE_ERROR_EVENT,
  SETTINGS_SAVE_DELAY_MS,
} from "..";
import PaintCanvas from "../../PaintCanvas";
import { createFakeCanvasFactory } from "../../../../testing/fakeCanvas";
import type { SettingsStoreLike } from "../../../storage";
import { collectSettings, type AppSettings } from "../../../settings";

const createApp = () =>
  new PaintCanvas({
    width: 10,
    height: 10,
    createCanvas: createFakeCanvasFactory(),
  });

/** A store in memory, holding some settings to start with */
const createStore = (initial?: unknown) => {
  const store = {
    name: "test",
    value: initial,
    load: vi.fn(async () => store.value),
    save: vi.fn(async (settings: AppSettings) => {
      store.value = structuredClone(settings);
    }),
  };
  return store satisfies SettingsStoreLike;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("SettingsAutosave", () => {
  it("should restore saved settings, then save changes after a pause", async () => {
    vi.useFakeTimers();
    const app = createApp();
    const sunset = {
      id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
      name: "Sunset",
      colours: ["#123456"],
    };
    const store = createStore({
      palettes: [sunset],
      colours: { foreground: "#ff0000", background: "#00ff00" },
    });
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    expect(app.palettes.items).toEqual([sunset]);
    expect(app.colours).toEqual({
      foreground: "#ff0000",
      background: "#00ff00",
    });
    expect(store.save).not.toHaveBeenCalled();

    app.palettes.addColour(sunset.id, "#abcdef");
    app.shortcuts.set("cut", null);
    app.input.update({ focusPen: true });
    app.setColour("#0000ff");
    app.ui.update({ theme: "dark" });
    await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DELAY_MS - 1);
    expect(store.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.save).toHaveBeenCalledOnce();
    expect(store.value).toEqual(collectSettings(app));
  });

  it("should not save when only other parts of the canvas change", async () => {
    vi.useFakeTimers();
    const app = createApp();
    const store = createStore();
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    app.toggleInterface();
    await vi.runAllTimersAsync();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("should ignore invalid saved settings", async () => {
    const app = createApp();
    const before = collectSettings(app);
    const autosave = new SettingsAutosave(app, createStore({ palette: "red" }));
    await autosave.ready;
    expect(collectSettings(app)).toEqual(before);
  });

  it("should use its own delay", async () => {
    vi.useFakeTimers();
    const app = createApp();
    const store = createStore();
    const autosave = new SettingsAutosave(app, store, { delayMs: 10 });
    await autosave.ready;
    app.swapColours();
    await vi.advanceTimersByTimeAsync(10);
    expect(store.save).toHaveBeenCalledOnce();
  });

  it("should save pending changes when stopped, and stop listening", async () => {
    vi.useFakeTimers();
    const app = createApp();
    const store = createStore();
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    app.setColour("#111111");
    autosave.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledOnce();
    app.setColour("#222222");
    autosave.stop();
    await vi.runAllTimersAsync();
    expect(store.save).toHaveBeenCalledOnce();
  });

  it("should not save when stopped without changes", async () => {
    const app = createApp();
    const store = createStore();
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    autosave.stop();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("should not restore or listen when stopped before loading finishes", async () => {
    const app = createApp();
    const store = createStore({ palette: ["#123456"] });
    const autosave = new SettingsAutosave(app, store);
    autosave.stop();
    await autosave.ready;
    expect(app.palettes.items).toEqual([]);
  });

  it("should tell listeners when loading or saving fails, and save again on the next change", async () => {
    vi.useFakeTimers();
    const app = createApp();
    const store = createStore();
    store.load.mockRejectedValueOnce(new Error("load"));
    store.save.mockRejectedValueOnce(new Error("save"));
    const errors: unknown[] = [];
    const autosave = new SettingsAutosave(app, store);
    autosave.addEventListener(SETTINGS_AUTOSAVE_ERROR_EVENT, (event) =>
      errors.push((event as CustomEvent).detail),
    );
    await autosave.ready;
    app.setColour("#111111");
    await vi.runAllTimersAsync();
    expect(errors.map((error) => (error as Error).message)).toEqual([
      "load",
      "save",
    ]);
    // The failed save is tried again with the next change
    app.setColour("#222222");
    await vi.runAllTimersAsync();
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(store.value).toEqual(collectSettings(app));
  });

  it("should skip saving settings that are the same as the saved ones", async () => {
    const app = createApp();
    const store = createStore();
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    app.setColour("#123456");
    app.setColour("#000000");
    await autosave.save();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("should leave profile graphs out of the saved settings while a profile store keeps them, adding restored ones", async () => {
    const graph = {
      id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
      name: "Soft",
      points: [
        { x: 0, y: -10, i: "linear" as const },
        { x: 10, y: 0, i: "linear" as const },
      ],
    };
    const app = createApp();
    const profiles = {
      list: vi.fn(async () => []),
      put: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    app.useAssetStores({ profiles });
    const store = createStore({ profiles: [graph] });
    const autosave = new SettingsAutosave(app, store, { delayMs: 0 });
    await autosave.ready;
    expect(app.profiles.graphs).toEqual([graph]);
    await vi.waitFor(() => expect(profiles.put).toHaveBeenCalledWith(graph));
    app.setColour("#123456");
    await vi.waitFor(() => expect(store.save).toHaveBeenCalled());
    expect(store.value).not.toHaveProperty("profiles");
    autosave.stop();
  });

  it("should move colours older versions saved in PaintCanvas's palette to one of the user's, saving the settings again without them", async () => {
    const app = createApp();
    const store = createStore({ palette: ["#123456", "#abcdef"] });
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    expect(app.palettes.items).toMatchObject([
      { name: "My colours", colours: ["#123456", "#abcdef"] },
    ]);
    expect(store.save).toHaveBeenCalledOnce();
    expect(store.value).not.toHaveProperty("palette");
    expect(store.value).toEqual(collectSettings(app));
    autosave.stop();
  });

  it("should restore and save the settings wrapper apps add", async () => {
    vi.useFakeTimers();
    const app = createApp();
    const target = new EventTarget();
    let sound = false;
    app.settingsExtensions.add({
      key: "livecanvas",
      validate: (value): value is { sound: boolean } =>
        typeof (value as { sound?: unknown })?.sound === "boolean",
      collect: () => ({ sound }),
      apply: (value) => (sound = value.sound),
      target,
    });
    const store = createStore({ livecanvas: { sound: true } });
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    expect(sound).toBe(true);
    sound = false;
    target.dispatchEvent(new Event("change"));
    await vi.runAllTimersAsync();
    expect(store.value).toMatchObject({ livecanvas: { sound: false } });
    autosave.stop();
  });
});
