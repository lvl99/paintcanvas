import { afterEach, describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import "..";
import type { PaintCanvasElement } from "..";
import PaintCanvas, { Panel, Tool } from "../../../../lib/classes/PaintCanvas";
import { SHORTCUT_EVENT } from "../../../../lib/classes/KeyboardShortcuts";
import { STATE_EVENT, type LayoutState } from "../../../layout";
import type { PcPanel } from "../../PcPanel";
import type { PcToolbar } from "../../PcToolbar";
import { createApp } from "../../../../testing/app";
import { MemoryLayerStore } from "../../../../testing/layerStore";
import { createFakeLocks } from "../../../../testing/locks";
import IndexedDbLayerStore, {
  IndexedDbSettingsStore,
} from "../../../../lib/storage";
import {
  AUTOSAVE_ERROR_EVENT,
  AutosaveState,
} from "../../../../lib/classes/LayerAutosave";
import type { PcDialog } from "../../PcDialog";
import type { PcStats } from "../../PcStats";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";
import {
  events,
  pointerEvent,
  query,
  queryAll,
} from "../../../../testing/elements";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** Mount a layout with some content, at a width */
const setup = async (content = "", width = 1000, app = createApp()) => {
  const layout = document.createElement("paint-canvas") as PaintCanvasElement;
  layout.app = app;
  layout.innerHTML = content;
  document.body.append(layout);
  layout.width = width;
  await layout.updateComplete;
  // Slot changes render once more
  await layout.updateComplete;
  return { layout, app };
};

/** A panel for a side */
const panelHtml = (side: string, label: string, extra = "") =>
  `<pc-panel slot="${side}" icon="layers" label="${label}" ${extra}><button>Inside ${label}</button></pc-panel>`;

describe("paint-canvas", () => {
  it("should make its own canvas when given none", async () => {
    // jsdom has no OffscreenCanvas
    const { factory } = createRecordingCanvasFactory();
    vi.stubGlobal("OffscreenCanvas", function (width: number, height: number) {
      return factory(width, height);
    });
    const layout = document.createElement("paint-canvas") as PaintCanvasElement;
    document.body.append(layout);
    await layout.updateComplete;
    expect(layout.app).toBeInstanceOf(PaintCanvas);
  });

  it("should show the toolbar, tool settings, canvas and canvas map by default, in labelled regions", async () => {
    const { layout, app } = await setup();
    expect(query<PcToolbar>(layout, ".side.left pc-toolbar").app).toBe(app);
    expect(queryAll(layout, ".top pc-tool-settings")).toHaveLength(1);
    expect(queryAll(layout, ".center pc-canvas")).toHaveLength(1);
    expect(queryAll(layout, ".overlay pc-canvas-map")).toHaveLength(1);
    expect(
      queryAll(layout, "[role=region]").map((r) =>
        r.getAttribute("aria-label"),
      ),
    ).toEqual(["Tools", "Tool settings", "Canvas", "Status", "Panels"]);
    // The app menu button shows only with a menu
    expect(query<PcToolbar>(layout, "pc-toolbar").menu).toBe(false);
    app.selectTool(Tool.Pan);
    await layout.updateComplete;
    expect(queryAll(layout, ".top pc-tool-settings")).toHaveLength(0);
  });

  it("should describe the canvas in the footer unless given other content", async () => {
    const { layout, app } = await setup();
    expect(query<PcStats>(layout, "footer pc-stats").app).toBe(app);
    layout.remove();
    const given = await setup('<p slot="footer">Mine</p>');
    expect(queryAll(given.layout, "pc-stats")).toHaveLength(0);
  });

  it("should replace defaults with given content, and pass its menu text to the toolbar", async () => {
    const { layout } = await setup(
      '<div slot="left"></div><p slot="center">Mine</p>',
    );
    expect(queryAll(layout, "pc-toolbar")).toHaveLength(0);
    expect(queryAll(layout, "pc-canvas")).toHaveLength(0);
    const other = await setup();
    other.layout.menuText = "App";
    other.layout.menuLabel = "App menu";
    await other.layout.updateComplete;
    expect(query<PcToolbar>(other.layout, "pc-toolbar")).toMatchObject({
      menuText: "App",
      menuLabel: "App menu",
    });
  });

  it("should leave out the toolbar's layers menu when a side has a layers menu", async () => {
    const layersPanel = (side: string) =>
      `<pc-panel slot="${side}" icon="layers" label="Layers"><pc-panel-layers></pc-panel-layers></pc-panel>`;
    const { layout, app } = await setup(layersPanel("right"));
    expect(query<PcToolbar>(layout, "pc-toolbar").layers).toBe(false);
    app.togglePanel(Panel.Layers);
    await layout.updateComplete;
    expect(queryAll(layout, ".center pc-panel-layers")).toHaveLength(0);
    layout.remove();
    // In the left side too (which then has no toolbar), or given straight in a side
    const left = await setup(layersPanel("left"));
    left.app.togglePanel(Panel.Layers);
    await left.layout.updateComplete;
    expect(queryAll(left.layout, ".center pc-panel-layers")).toHaveLength(0);
    left.layout.remove();
    const direct = await setup(
      '<pc-panel-layers slot="right"></pc-panel-layers>',
    );
    expect(query<PcToolbar>(direct.layout, "pc-toolbar").layers).toBe(false);
    direct.layout.remove();
    // Without one, the toolbar has its own
    const plain = await setup(panelHtml("right", "Chat"));
    expect(query<PcToolbar>(plain.layout, "pc-toolbar").layers).toBe(true);
  });

  it("should show the app menu while it's open, and the toolbar's other menus over the canvas", async () => {
    const { layout, app } = await setup('<nav slot="menu">Menu</nav>');
    expect(query<PcToolbar>(layout, "pc-toolbar").menu).toBe(true);
    const menu = query(layout, ".menu-panel");
    expect(menu.hasAttribute("open")).toBe(false);
    app.togglePanel(Panel.Menu);
    await layout.updateComplete;
    expect(menu.hasAttribute("open")).toBe(true);
    for (const [panel, tag] of [
      [Panel.Brush, "pc-panel-brushes"],
      [Panel.Eraser, "pc-panel-brushes"],
      [Panel.Layers, "pc-panel-layers"],
      [Panel.Palette, "pc-panel-colours"],
    ] as const) {
      app.togglePanel(panel);
      await layout.updateComplete;
      expect(queryAll(layout, `.center ${tag}`)).toHaveLength(1);
    }
    app.toggleInterface();
    await layout.updateComplete;
    expect(layout.hasAttribute("ui-hidden")).toBe(true);
    expect(queryAll(layout, ".center pc-panel-layers")).toHaveLength(0);
  });

  it("should close the colour palette on a press outside it and the colours that open it", async () => {
    const { layout, app } = await setup();
    const pressOn = (target: EventTarget) =>
      target.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, composed: true }),
      );
    // Nothing to close
    pressOn(document.body);
    app.togglePanel(Panel.Palette);
    await layout.updateComplete;
    const palette = query(layout, ".center pc-panel-colours");
    await (palette as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    pressOn(palette.shadowRoot!.querySelector(".swatch")!);
    const toolbar = query(layout, "pc-toolbar");
    pressOn(toolbar.shadowRoot!.querySelector("pc-colour-pair")!);
    expect(app.panel).toBe(Panel.Palette);
    pressOn(document.body);
    expect(app.panel).toBeNull();
  });

  it("should report its state as attributes and events", async () => {
    const { layout } = await setup("", 1000);
    const states = events<LayoutState>(layout, STATE_EVENT);
    expect([
      layout.hasAttribute("narrow"),
      layout.getAttribute("left-mode"),
      layout.getAttribute("right-mode"),
    ]).toEqual([false, "docked", "docked"]);
    layout.width = 500;
    await layout.updateComplete;
    expect(layout.hasAttribute("narrow")).toBe(true);
    expect(layout.getAttribute("right-mode")).toBe("rail");
    layout.dispatchEvent(pointerEvent("pointerdown", 0, 0));
    expect(layout.input).toBe("mouse");
    layout.dispatchEvent(
      Object.assign(pointerEvent("pointerdown", 0, 0), { pointerType: "pen" }),
    );
    await layout.updateComplete;
    expect(layout.getAttribute("input")).toBe("pen");
    layout.dispatchEvent(
      Object.assign(pointerEvent("pointerdown", 0, 0), {
        pointerType: "touch",
      }),
    );
    expect(layout.input).toBe("touch");
    await layout.updateComplete;
    expect(states.map((s) => [s.narrow, s.rightMode, s.input])).toEqual([
      [true, "rail", "mouse"],
      [true, "rail", "pen"],
      [true, "rail", "touch"],
    ]);
    layout.requestUpdate();
    await layout.updateComplete;
    expect(states).toHaveLength(3);
  });

  it("should follow its width with a ResizeObserver when there is one", async () => {
    let callback: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: ResizeObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const layout = document.createElement("paint-canvas") as PaintCanvasElement;
    layout.app = createApp();
    document.body.append(layout);
    callback!(
      [{ contentRect: { width: 321.4 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    expect(layout.width).toBe(321);
    callback!([], {} as ResizeObserver);
    expect(layout.width).toBe(0);
  });

  it("should open a rail's panels over the canvas, one at a time, and close them on Escape or a press outside", async () => {
    const { layout } = await setup(
      panelHtml("right", "Layers") + panelHtml("right", "Chat", "badge"),
      500,
    );
    const [layers, chat] = [
      ...layout.querySelectorAll<PcPanel>("pc-panel"),
    ] as [PcPanel, PcPanel];
    const buttons = queryAll<HTMLButtonElement>(
      layout,
      ".side.right .rail button",
    );
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Layers",
      "Chat (new)",
    ]);
    expect(queryAll(layout, ".rail .badge")).toHaveLength(1);
    buttons[0]!.click();
    await layout.updateComplete;
    expect(layers.hasAttribute("data-pc-open")).toBe(true);
    expect(document.activeElement?.textContent).toBe("Inside Layers");
    expect(buttons[0]!.getAttribute("aria-expanded")).toBe("true");
    buttons[1]!.click();
    expect([
      layers.hasAttribute("data-pc-open"),
      chat.hasAttribute("data-pc-open"),
    ]).toEqual([false, true]);
    // Pressing inside the panel or its button keeps it open
    chat.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    expect(layout.openPanel).toBe(chat);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(layout.openPanel).toBeUndefined();
    buttons[1]!.click();
    chat.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true, composed: true }),
    );
    expect(layout.openPanel).toBe(chat);
    chat.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
      }),
    );
    expect(layout.openPanel).toBeUndefined();
    expect(layout.shadowRoot!.activeElement).toBe(buttons[1]);
    // The button closes it too
    buttons[1]!.click();
    buttons[1]!.click();
    expect(layout.openPanel).toBeUndefined();
    layout.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });

  it("should focus a panel without anything focusable, update rail buttons as panels change, and close panels when the rail goes", async () => {
    const { layout } = await setup(
      '<pc-panel slot="left" icon="layers" label="Notes"><p>Text</p></pc-panel>',
      500,
    );
    const panel = layout.querySelector("pc-panel") as PcPanel;
    const button = query<HTMLButtonElement>(layout, ".side.left .rail button");
    button.click();
    expect(document.activeElement).toBe(panel);
    panel.label = "Ideas";
    await new Promise((resolve) => setTimeout(resolve));
    await layout.updateComplete;
    expect(button.getAttribute("aria-label")).toBe("Ideas");
    layout.width = 1000;
    await layout.updateComplete;
    expect(layout.openPanel).toBeUndefined();
    expect(panel.hasAttribute("data-pc-open")).toBe(false);
  });

  it("should float a side over the canvas, collapsed to a button until opened", async () => {
    const { layout } = await setup(panelHtml("right", "Layers"));
    layout.rightModes = "floating";
    await layout.updateComplete;
    const toggle = query<HTMLButtonElement>(layout, ".side.right .collapse");
    expect([
      toggle.getAttribute("aria-expanded"),
      toggle.getAttribute("aria-label"),
    ]).toEqual(["false", "Show Panels"]);
    expect(query(layout, ".side.right .content").hidden).toBe(true);
    toggle.click();
    await layout.updateComplete;
    expect(toggle.getAttribute("aria-label")).toBe("Hide Panels");
    expect(query(layout, ".side.right .content").hidden).toBe(false);
    layout.leftModes = "floating";
    await layout.updateComplete;
    expect(query(layout, ".side.left .collapse").textContent?.trim()).toBe("»");
  });

  it("should keep the canvas clear of open floating sides", async () => {
    const { layout } = await setup(panelHtml("right", "Layers"));
    layout.rightModes = "floating";
    layout.collapsed = { left: true, right: false };
    await layout.updateComplete;
    const float = query(layout, ".side.right .float");
    vi.spyOn(float, "getBoundingClientRect").mockReturnValue({
      width: 240,
    } as DOMRect);
    layout.requestUpdate();
    await layout.updateComplete;
    await layout.updateComplete;
    expect(
      query<HTMLElement & { insets: unknown }>(layout, "pc-canvas").insets,
    ).toEqual({ top: 0, right: 240, bottom: 0, left: 0 });
  });

  it("should handle keyboard shortcuts unless asked not to, saving a screenshot on Cmd/Ctrl + S", async () => {
    const { layout, app } = await setup();
    const saveFile = vi.fn(async () => "download" as const);
    layout.saveFile = saveFile;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
    expect(app.tool).toBe(Tool.Eraser);
    vi.stubGlobal("OffscreenCanvas", class {});
    const screenshot = vi
      .spyOn(layout, "saveScreenshot")
      .mockResolvedValue("download");
    window.dispatchEvent(
      new CustomEvent(SHORTCUT_EVENT, { detail: { type: "undo" } }),
    );
    window.dispatchEvent(
      new CustomEvent(SHORTCUT_EVENT, { detail: { type: "save" } }),
    );
    expect(screenshot).toHaveBeenCalledOnce();
    layout.shortcuts = false;
    await layout.updateComplete;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
    expect(app.tool).toBe(Tool.Eraser);
    layout.remove();
  });

  it("should open the brush configuration for the current or a new preset, and apply or close it", async () => {
    const { layout, app } = await setup();
    layout.configure("brush");
    await layout.updateComplete;
    const config = () =>
      layout.shadowRoot!.querySelector("pc-brush-config") as
        (HTMLElement & { config: { name?: string } }) | null;
    expect(config()?.getAttribute("kind")).toBe("brush");
    config()!.dispatchEvent(
      new CustomEvent("pc-save", {
        detail: { ...app.brush.preset, alpha: 0.5 },
      }),
    );
    await layout.updateComplete;
    expect(app.brush.preset.alpha).toBe(0.5);
    expect(config()).toBeNull();
    // The user's own preset can be deleted from the window
    const own = app.newPreset(app.eraser.preset, "Mine");
    await app.customPresets.save(own);
    app.eraser.select(own.id);
    layout.configure("eraser");
    await layout.updateComplete;
    expect(config()?.getAttribute("editingid")).toBe(own.id);
    config()!.dispatchEvent(new CustomEvent("pc-close"));
    app.togglePanel(Panel.Brush);
    layout.newPreset("brush");
    await layout.updateComplete;
    expect(config()!.config.name).toBe("New brush");
    expect(app.panel).toBeNull();
  });

  it("should open the brush configuration from the tool settings and the presets menu", async () => {
    const { layout, app } = await setup();
    query(layout, "pc-tool-settings").dispatchEvent(
      new CustomEvent("pc-configure-brush", { detail: "brush" }),
    );
    await layout.updateComplete;
    expect(queryAll(layout, "pc-brush-config")).toHaveLength(1);
    layout.configuring = undefined;
    app.togglePanel(Panel.Eraser);
    await layout.updateComplete;
    query(layout, "pc-panel-brushes").dispatchEvent(
      new CustomEvent("pc-new-preset"),
    );
    await layout.updateComplete;
    expect(query(layout, "pc-brush-config").getAttribute("kind")).toBe(
      "eraser",
    );
  });

  it("should start with touch input on touch devices, and open panels from code", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { layout } = await setup(
      '<pc-panel slot="right" icon="layers" label="Layers"></pc-panel>',
      500,
    );
    expect(layout.input).toBe("touch");
    layout.closePanel(true);
    const panel = layout.querySelector("pc-panel") as PcPanel;
    layout.togglePanel(panel);
    expect(layout.openPanel).toBe(panel);
    layout.closePanel(true);
    expect(layout.openPanel).toBeUndefined();
    const text = await setup('<span slot="top"></span>');
    expect(queryAll(text.layout, "pc-tool-settings")).toHaveLength(0);
  });

  it("should keep the drawing in the browser under its store name, changing or stopping with the attribute", async () => {
    const { layout, app } = await setup();
    expect(app.autosave).toBeUndefined();
    layout.store = "sketchbook";
    await layout.updateComplete;
    const first = app.autosave;
    expect(first?.store).toBeInstanceOf(IndexedDbLayerStore);
    expect(first?.store.name).toBe("sketchbook");
    layout.store = "other";
    await layout.updateComplete;
    expect(app.autosave?.store.name).toBe("other");
    expect(first?.state).not.toBe(AutosaveState.Ready);
    // The same name again keeps the autosave
    const second = app.autosave;
    layout.requestUpdate("store");
    await layout.updateComplete;
    expect(app.autosave).toBe(second);
    layout.store = undefined;
    await layout.updateComplete;
    expect(app.autosave).toBeUndefined();
  });

  it("should keep the app settings in the browser under its settings store name", async () => {
    const name = `settings-${crypto.randomUUID()}`;
    const first = await setup();
    first.layout.settingsStore = name;
    await first.layout.updateComplete;
    await first.layout.settingsAutosave?.ready;
    first.app.palette.set(["#123456"]);
    first.app.shortcuts.set("tool-brush", { key: "p" });
    // Removing the name stops saving, saving the waiting change
    first.layout.settingsStore = undefined;
    await first.layout.updateComplete;
    const store = new IndexedDbSettingsStore(name);
    await vi.waitFor(async () =>
      expect(await store.load()).toMatchObject({ palette: ["#123456"] }),
    );
    first.app.palette.set([]);
    // Another layout with the same name restores them
    const second = await setup();
    second.layout.settingsStore = name;
    await second.layout.updateComplete;
    await second.layout.settingsAutosave?.ready;
    expect(second.app.palette.colours).toEqual(["#123456"]);
    expect(second.app.shortcuts.combo("tool-brush")).toEqual({ key: "p" });
  });

  it("should show a toast when the app settings can't be kept", async () => {
    vi.spyOn(IndexedDbSettingsStore.prototype, "load").mockRejectedValue(
      new Error("No"),
    );
    const { layout } = await setup();
    const toasts: unknown[] = [];
    layout.addEventListener("pc-toast", (event) =>
      toasts.push((event as CustomEvent).detail),
    );
    layout.settingsStore = "broken";
    await layout.updateComplete;
    await vi.waitFor(() =>
      expect(toasts).toContainEqual({
        message: "Couldn't keep your settings in this browser",
        kind: "error",
      }),
    );
  });

  it("should leave the canvas's own autosave alone, and stop its own when given another canvas", async () => {
    const { layout, app } = await setup();
    const own = app.useLayerStore(new MemoryLayerStore(), {
      locks: null,
      document: null,
    });
    layout.requestUpdate("store");
    await layout.updateComplete;
    expect(app.autosave).toBe(own);

    layout.store = "sketchbook";
    await layout.updateComplete;
    const started = app.autosave;
    expect(started?.store.name).toBe("sketchbook");
    const next = createApp();
    layout.app = next;
    await layout.updateComplete;
    expect(app.autosave).toBeUndefined();
    expect(next.autosave?.store.name).toBe("sketchbook");
    // A canvas given with its own autosave keeps it when there's no name
    layout.store = undefined;
    await layout.updateComplete;
    expect(next.autosave).toBeUndefined();
    const another = createApp();
    const kept = another.useLayerStore(new MemoryLayerStore(), {
      locks: null,
      document: null,
    });
    layout.app = another;
    await layout.updateComplete;
    expect(another.autosave).toBe(kept);
  });

  it("should block the layout while another window draws on the drawing, until taking it over", async () => {
    const { layout, app } = await setup();
    const { locks } = createFakeLocks();
    // Another window has the drawing
    locks
      .request("paintcanvas:test", {}, () => new Promise(() => {}))
      // Taken over below
      .catch(() => undefined);
    const autosave = app.useLayerStore(new MemoryLayerStore(), {
      locks,
      document: null,
    });
    await layout.updateComplete;
    expect(layout.blocked).toBe(true);
    const dialog = query<PcDialog>(layout, "pc-dialog.elsewhere");
    expect([dialog.heading, dialog.message]).toEqual([
      "You are already drawing in another window",
      'This drawing is open in another window or tab, and only one can draw on it at a time. Choose "Draw here instead" to continue in this window; the other one stops.',
    ]);
    expect(dialog.choices.map((choice) => choice.label)).toEqual([
      "Draw here instead",
    ]);
    expect(queryAll(layout, "[inert]")).toHaveLength(7);
    // Shortcuts don't change the drawing
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
    expect(app.tool).toBe(Tool.Brush);
    // Escape leaves it blocked
    dialog.choose("cancel");
    await layout.updateComplete;
    expect(layout.blocked).toBe(true);

    dialog.choose("take-over");
    await vi.waitFor(() => expect(autosave?.state).toBe(AutosaveState.Ready));
    await layout.updateComplete;
    expect(layout.blocked).toBe(false);
    expect(queryAll(layout, "pc-dialog")).toHaveLength(0);
    expect(queryAll(layout, "[inert]")).toHaveLength(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
    expect(app.tool).toBe(Tool.Eraser);
    layout.remove();
  });

  it("should tell the user when the drawing can't be loaded or saved", async () => {
    const { layout, app } = await setup();
    const toasts = events(layout, "pc-toast");
    const first = app.useLayerStore(new MemoryLayerStore(), {
      locks: null,
      document: null,
      encode: async () => new Blob(),
    });
    await layout.updateComplete;
    first?.dispatchEvent(new CustomEvent(AUTOSAVE_ERROR_EVENT));
    expect(toasts).toEqual([
      {
        message: "Couldn't keep the drawing in this browser",
        kind: "error",
      },
    ]);
    // Only the current autosave's errors
    app.useLayerStore(undefined);
    await layout.updateComplete;
    first?.dispatchEvent(new CustomEvent(AUTOSAVE_ERROR_EVENT));
    expect(toasts).toHaveLength(1);
  });
});
