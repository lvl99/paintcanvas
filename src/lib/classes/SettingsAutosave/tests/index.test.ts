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
    const store = createStore({
      palette: ["#123456"],
      colours: { foreground: "#ff0000", background: "#00ff00" },
    });
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    expect(app.palette.colours).toEqual(["#123456"]);
    expect(app.colours).toEqual({
      foreground: "#ff0000",
      background: "#00ff00",
    });
    expect(store.save).not.toHaveBeenCalled();

    app.palette.add("#abcdef");
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
    app.palette.set([]);
    autosave.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.save).toHaveBeenCalledOnce();
    app.palette.set(["#000000"]);
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
    const store = createStore({ palette: [] });
    const autosave = new SettingsAutosave(app, store);
    autosave.stop();
    await autosave.ready;
    expect(app.palette.colours).not.toEqual([]);
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
    app.palette.set([]);
    await vi.runAllTimersAsync();
    expect(errors.map((error) => (error as Error).message)).toEqual([
      "load",
      "save",
    ]);
    // The failed save is tried again with the next change
    app.palette.set(["#000000"]);
    await vi.runAllTimersAsync();
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(store.value).toEqual(collectSettings(app));
  });

  it("should skip saving settings that are the same as the saved ones", async () => {
    const app = createApp();
    const store = createStore();
    const autosave = new SettingsAutosave(app, store);
    await autosave.ready;
    app.palette.add("#123456");
    app.palette.remove(app.palette.colours.length - 1);
    await autosave.save();
    expect(store.save).not.toHaveBeenCalled();
  });
});
