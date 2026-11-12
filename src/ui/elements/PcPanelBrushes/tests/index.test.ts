import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { CANCEL_CHOICE, type PcDialog } from "../../PcDialog";
import { previewSizes, type PcPanelBrushes } from "..";
import type { PcBrushSize } from "../../PcBrushSize";
import type { PcNumberSlider } from "../../PcNumberSlider";
import { Panel } from "../../../../lib/classes/PaintCanvas";
import {
  mount,
  query,
  queryAll,
  toastText,
} from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

describe("pc-panel-brushes", () => {
  it("should render nothing without an app", async () => {
    const element = await mount<PcPanelBrushes>("pc-panel-brushes");
    element.selectPreset("round1");
    expect(element.settings).toBeUndefined();
    expect(queryAll(element, "button")).toHaveLength(0);
  });

  it("should control the brush by default and the eraser when kind is eraser", async () => {
    const app = createApp();
    const brush = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    const eraser = await mount<PcPanelBrushes>("pc-panel-brushes", {
      app,
      kind: "eraser",
    });
    expect(brush.settings).toBe(app.brush);
    expect(eraser.settings).toBe(app.eraser);
    expect(query(eraser, "h2").textContent).toBe("Eraser");
  });

  it("should list presets and select one on click", async () => {
    const app = createApp();
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    expect(queryAll(element, "[data-preset]")).toHaveLength(
      Object.keys(app.brush.presets).length,
    );
    app.togglePanel(Panel.Brush);
    query(element, '[data-preset="round20"]').click();
    await element.updateComplete;
    expect(app.brush.width).toBe(20);
    expect(app.panel).toBeNull();
    // The current preset's shape, name and size, on one row
    expect(query(element, ".current .name").textContent).toBe(
      app.brush.preset.name,
    );
    const size = query<PcBrushSize>(element, ".size");
    await size.updateComplete;
    const slider = query<PcNumberSlider>(size, "pc-number-slider");
    await slider.updateComplete;
    expect(query(slider, "[role=slider]").textContent?.trim()).toBe("20");
    app.brush.update({ constrainProportions: false });
    app.brush.setSize(20, 10);
    await element.updateComplete;
    await size.updateComplete;
    await slider.updateComplete;
    expect(query(slider, "[role=slider]").textContent?.trim()).toBe("20 × 10");
  });

  it("should show the current preset's shape image, or a round shape without one", async () => {
    const app = createApp();
    app.brush.apply({ ...app.brush.preset, image: undefined });
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    const shape = query(element, ".current-shape");
    expect(shape.classList.contains("image")).toBe(false);
    app.brush.apply({
      ...app.brush.preset,
      image: "data:image/png;base64,AAAA",
    });
    await element.updateComplete;
    expect(shape.classList.contains("image")).toBe(true);
    expect(shape.style.maskImage).toBe('url("data:image/png;base64,AAAA")');
    // A preset without a name shows its ID
    app.brush.apply({ ...app.brush.preset, name: undefined });
    await element.updateComplete;
    expect(query(element, ".current .name").textContent).toBe(
      app.brush.preset.id,
    );
  });

  it("should show the size control for its settings", async () => {
    const app = createApp();
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", {
      app,
      kind: "eraser",
    });
    const size = query(element, "pc-brush-size") as PcBrushSize;
    expect(size.settings).toBe(app.eraser);
    expect(size.label).toBe("Eraser size");
  });

  it("should name presets by their ID when they have no name", async () => {
    const app = createApp();
    Object.assign(app.brush.presets, { unnamed: { id: "unnamed" } });
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    const tile = query(element, '[data-preset="unnamed"]');
    expect(tile.getAttribute("aria-label")).toBe("unnamed");
    expect(tile.getAttribute("title")).toBe("unnamed");
  });

  /** One of the user's presets, and another author's */
  const customPresets = async (app: ReturnType<typeof createApp>) => {
    const mine = app.newPreset({ id: "x", width: 25 }, "Mine");
    const theirs = {
      id: crypto.randomUUID(),
      name: "Theirs",
      author: { name: "Ann", handle: "ann.test" },
    };
    await app.customPresets.save(mine, theirs);
    return { mine, theirs };
  };

  it("should group presets by author, with actions below", async () => {
    const app = createApp();
    const { mine, theirs } = await customPresets(app);
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    expect(queryAll(element, "h3").map((h) => h.textContent)).toEqual([
      "My presets",
      "PaintCanvas",
      "Ann",
    ]);
    expect(
      queryAll(element, 'ul[aria-label="My presets"] [data-preset]').map(
        (tile) => tile.dataset.preset,
      ),
    ).toEqual([mine.id]);
    expect(query(element, `[data-preset="${theirs.id}"]`).className).toBe(
      "custom",
    );
    expect(query(element, '[data-preset="round1"]').className).toBe("");
    const events: unknown[] = [];
    element.addEventListener("pc-new-preset", (e) =>
      events.push((e as CustomEvent).detail),
    );
    query(element, "button.new-preset").click();
    expect(events).toEqual(["brush"]);
  });

  it("should show the delete cursor while Alt/Option is held", async () => {
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", {
      app: createApp(),
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    expect(element.hasAttribute("deleting")).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
    expect(element.hasAttribute("deleting")).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    window.dispatchEvent(new Event("blur"));
    expect(element.hasAttribute("deleting")).toBe(false);
    element.remove();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    expect(element.hasAttribute("deleting")).toBe(false);
  });

  it("should delete a custom preset on Alt/Option-click after confirming, but not PaintCanvas presets", async () => {
    const app = createApp();
    const { mine } = await customPresets(app);
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    const toasts: unknown[] = [];
    element.addEventListener("pc-toast", (e) =>
      toasts.push(toastText((e as CustomEvent).detail)),
    );
    element.confirm = vi.fn(() => false);
    const altClick = (id: string) =>
      query(element, `[data-preset="${id}"]`).dispatchEvent(
        new MouseEvent("click", { altKey: true, bubbles: true }),
      );
    altClick(mine.id);
    expect(app.customPresets.get(mine.id)).toBeDefined();
    element.confirm = vi.fn(() => true);
    altClick(mine.id);
    await vi.waitFor(() =>
      expect(app.customPresets.get(mine.id)).toBeUndefined(),
    );
    expect(element.confirm).toHaveBeenCalledWith({
      heading: "Delete preset",
      message: 'Delete "Mine"? This can\'t be undone.',
      confirm: "Delete",
      cancel: "Cancel",
      cancelling: true,
    });
    // Alt-clicking a PaintCanvas preset selects it
    altClick("round5");
    expect(app.brush.presetId).toBe("round5");
    vi.spyOn(app.customPresets, "remove").mockRejectedValueOnce(
      new Error("no"),
    );
    await element.deletePreset({ id: "gone" });
    expect(toasts).toEqual([
      'success: Deleted "Mine"',
      'error: Couldn\'t delete "gone"',
    ]);
  });

  it("should export the custom presets, or say why it can't", async () => {
    const app = createApp();
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    const toasts: unknown[] = [];
    element.addEventListener("pc-toast", (e) =>
      toasts.push(toastText((e as CustomEvent).detail)),
    );
    const saved: { name: string; text: string }[] = [];
    element.saveFile = vi.fn(async (blob: Blob, name: string) => {
      saved.push({ name, text: await blob.text() });
      return "download" as const;
    });
    await element.exportFile();
    const { mine, theirs } = await customPresets(app);
    query(element, "button.export").click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toMatch(/^paintcanvas-brush-presets-.*\.json$/);
    expect(JSON.parse(saved[0]!.text).items).toEqual([mine, theirs]);
    vi.mocked(element.saveFile).mockRejectedValueOnce(new Error("denied"));
    await element.exportFile();
    expect(toasts).toEqual([
      "error: No brush presets to export",
      "error: Error exporting brush preset JSON file",
    ]);
  });

  it("should import presets from a file, or say why it can't", async () => {
    const app = createApp();
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    const toasts: unknown[] = [];
    element.addEventListener("pc-toast", (e) =>
      toasts.push(toastText((e as CustomEvent).detail)),
    );
    const preset = { id: crypto.randomUUID(), name: "Imported" };
    const file = (presets: unknown[]) =>
      new File(
        [
          JSON.stringify({
            $schema:
              "https://lvl99.github.io/paintcanvas/schemas/brush-preset-collection-1.0.0.json",
            "@type": "PaintCanvas/BrushConfigCollection",
            items: presets,
          }),
        ],
        "presets.json",
      );
    const input = query<HTMLInputElement>(element, "input.import-file");
    // "Import" opens the hidden file field
    const pick = vi.spyOn(input, "click").mockImplementation(() => {});
    query(element, "button.import").click();
    expect(pick).toHaveBeenCalledOnce();
    const choose = async (files: File[]) => {
      Object.defineProperty(input, "files", {
        value: files,
        configurable: true,
      });
      input.dispatchEvent(new Event("change"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    await choose([file([preset])]);
    await vi.waitFor(() =>
      expect(app.customPresets.get(preset.id)).toEqual(preset),
    );
    await choose([]);
    await element.importFile(
      file([preset, { ...preset, id: crypto.randomUUID() }]),
    );
    await element.importFile(new File(["{"], "bad.json"));
    await element.importFile(new File(["{}"], "other.json"));
    await element.importFile(
      new File(
        [
          JSON.stringify({
            $schema:
              "https://lvl99.github.io/paintcanvas/schemas/brush-preset-collection-2.0.0.json",
          }),
        ],
        "newer.json",
      ),
    );
    const unreadable = new File(["x"], "x.json");
    vi.spyOn(unreadable, "text").mockRejectedValue(new Error("gone"));
    await element.importFile(unreadable);
    vi.spyOn(app.customPresets, "save").mockRejectedValueOnce(
      new Error("full"),
    );
    await element.importFile(file([preset]));
    expect(toasts).toEqual([
      "success: Imported 1 brush preset",
      "success: Imported 2 brush presets",
      "error: Failed to read brush preset JSON file",
      "error: Brush preset JSON file not compatible",
      "error: Unsupported brush presets file version",
      "error: Failed to read brush preset JSON file",
      "error: Failed to read brush preset JSON file",
    ]);
  });

  it("should confirm in a dialog and save to a JSON file by default", async () => {
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", {
      app: createApp(),
    });
    const confirmed = element.confirm({
      heading: "Delete?",
      confirm: "Delete",
      cancel: "Cancel",
    });
    const dialog = await vi.waitFor(() =>
      query<PcDialog>(element, "pc-dialog"),
    );
    await dialog.updateComplete;
    dialog.choose(CANCEL_CHOICE);
    expect(await confirmed).toBe(false);
    const picker = vi.fn(async () => ({
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    }));
    Object.assign(window, { showSaveFilePicker: picker });
    expect(await element.saveFile(new Blob(["{}"]), "a.json")).toBe("picker");
    expect(picker).toHaveBeenCalledWith({
      suggestedName: "a.json",
      types: [
        { description: "JSON file", accept: { "application/json": [".json"] } },
      ],
    });
    Reflect.deleteProperty(window, "showSaveFilePicker");
    vi.restoreAllMocks();
  });

  it("should do nothing with presets without an app", async () => {
    const element = await mount<PcPanelBrushes>("pc-panel-brushes");
    await element.deletePreset({ id: "a" });
    await element.importFile(new File(["{}"], "a.json"));
    await element.exportFile();
    expect(element.settings).toBeUndefined();
  });
});

describe("previewSizes", () => {
  it("should size presets relative to their family, and others against 50 pixels", () => {
    const sizes = previewSizes([
      { id: "a", group: "Round", width: 10, height: 10 },
      { id: "b", group: "Round", width: 50, height: 50 },
      { id: "c", width: 25, height: 10 },
      { id: "d", width: 100 },
      { id: "e" },
    ]);
    expect(Object.fromEntries(sizes)).toEqual({
      a: { width: 6, height: 6 },
      b: { width: 30, height: 30 },
      c: { width: 15, height: 6 },
      d: { width: 30, height: 3 },
      e: { width: 3, height: 3 },
    });
  });

  it("should say exporting failed for other errors", async () => {
    const app = createApp();
    await app.customPresets.save(app.newPreset(app.brush.preset, "Mine"));
    const element = await mount<PcPanelBrushes>("pc-panel-brushes", { app });
    const toasts: unknown[] = [];
    element.addEventListener("pc-toast", (e) =>
      toasts.push((e as CustomEvent).detail),
    );
    element.saveFile = () => Promise.reject(new Error("Disk full"));
    await element.exportFile();
    expect(toasts).toEqual([
      { message: "Error exporting brush preset JSON file", kind: "error" },
    ]);
  });
});
