import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { TOOLBAR_TOOLS, type PcToolbar } from "..";
import { Panel, Tool } from "../../../../lib/classes/PaintCanvas";
import { mount, query, queryAll } from "../../../../testing/elements";
import type { PcColourPair } from "../../PcColourPair";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

describe("pc-toolbar", () => {
  it("should render nothing without an app", async () => {
    const element = await mount<PcToolbar>("pc-toolbar");
    expect(queryAll(element, "button")).toHaveLength(0);
  });

  it("should render a button for every tool and mark the selected tool", async () => {
    const app = createApp();
    const element = await mount<PcToolbar>("pc-toolbar", { app });
    expect(queryAll(element, "button[data-tool]")).toHaveLength(
      TOOLBAR_TOOLS.length,
    );
    expect(
      query(element, `[data-tool="${Tool.Brush}"]`).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });

  it("should select a tool on click without opening its presets", async () => {
    const app = createApp();
    const element = await mount<PcToolbar>("pc-toolbar", { app });
    query(element, `[data-tool="${Tool.Eraser}"]`).click();
    await element.updateComplete;
    expect([app.tool, app.panel]).toEqual([Tool.Eraser, null]);
    query(element, `[data-tool="${Tool.Eraser}"]`).click();
    expect(app.panel).toBeNull();
    expect(
      query(element, `[data-tool="${Tool.Eraser}"]`).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });

  it("should toggle the layers and app menus", async () => {
    const app = createApp();
    const element = await mount<PcToolbar>("pc-toolbar", { app });
    const menu = query(element, `[data-panel="${Panel.Menu}"]`);
    expect([menu.textContent?.trim(), menu.getAttribute("aria-label")]).toEqual(
      ["☰", "Menu"],
    );
    element.menuText = "App";
    element.menuLabel = "My app menu";
    await element.updateComplete;
    expect([menu.textContent?.trim(), menu.getAttribute("aria-label")]).toEqual(
      ["App", "My app menu"],
    );
    query(element, `[data-panel="${Panel.Layers}"]`).click();
    expect(app.panel).toBe(Panel.Layers);
    query(element, `[data-panel="${Panel.Menu}"]`).click();
    expect(app.panel).toBe(Panel.Menu);
  });

  it("should leave out the layers menu button when asked to", async () => {
    const element = await mount<PcToolbar>("pc-toolbar", {
      app: createApp(),
      layers: false,
    });
    expect(queryAll(element, `[data-panel="${Panel.Layers}"]`)).toHaveLength(0);
    element.layers = true;
    await element.updateComplete;
    expect(queryAll(element, `[data-panel="${Panel.Layers}"]`)).toHaveLength(1);
  });

  it("should select a pressed colour and open the colour palette, then the colour picker while it's open", async () => {
    const app = createApp();
    const element = await mount<PcToolbar>("pc-toolbar", { app });
    const pair = query<PcColourPair>(element, "pc-colour-pair");
    expect(pair.app).toBe(app);
    const openPicker = vi
      .spyOn(pair, "openPicker")
      .mockImplementation(() => undefined);
    const press = (slot: string) =>
      query<HTMLButtonElement>(pair, `button.${slot}`).click();
    await pair.updateComplete;
    press("background");
    expect([app.selectedColour, app.panel]).toEqual([
      "background",
      Panel.Palette,
    ]);
    expect(openPicker).not.toHaveBeenCalled();
    press("foreground");
    expect([app.selectedColour, app.panel]).toEqual([
      "foreground",
      Panel.Palette,
    ]);
    expect(openPicker).toHaveBeenCalledOnce();
  });

  it("should undo and redo, enabling each button only when there is something to undo or redo", async () => {
    const app = createApp();
    const element = await mount<PcToolbar>("pc-toolbar", { app });
    const undo = query<HTMLButtonElement>(element, '[data-action="undo"]');
    const redo = query<HTMLButtonElement>(element, '[data-action="redo"]');
    expect([undo.disabled, redo.disabled]).toEqual([true, true]);
    app.layers.create();
    await element.updateComplete;
    expect([undo.disabled, redo.disabled]).toEqual([false, true]);
    undo.click();
    await element.updateComplete;
    expect(app.layers.layers).toHaveLength(1);
    expect([undo.disabled, redo.disabled]).toEqual([true, false]);
    redo.click();
    await element.updateComplete;
    expect(app.layers.layers).toHaveLength(2);
    expect([undo.disabled, redo.disabled]).toEqual([false, true]);
  });

  it("should show icons for the tools, undo, redo and the layers toggle", async () => {
    const app = createApp();
    const element = await mount<PcToolbar>("pc-toolbar", { app });
    expect(
      query(element, `[data-tool="${Tool.Brush}"] img`).getAttribute("src"),
    ).toMatch(/brush\.png$/);
    expect(
      query(element, `[data-tool="${Tool.Pan}"] img`).getAttribute("src"),
    ).toMatch(/pan\.png$/);
    expect(queryAll(element, "button[data-tool] img")).toHaveLength(
      TOOLBAR_TOOLS.length,
    );
    for (const [selector, icon] of [
      ['[data-action="undo"]', "undo"],
      ['[data-action="redo"]', "redo"],
      ['[data-panel="layers"]', "layers"],
    ]) {
      expect(
        query(element, `${selector} img`).getAttribute("src"),
        selector,
      ).toMatch(new RegExp(`${icon}\\.png$`));
    }
  });

  it("should show undo and redo with ⌘ shortcuts on Apple devices and ^ elsewhere", async () => {
    const platform = vi.spyOn(navigator, "platform", "get");
    platform.mockReturnValue("MacIntel");
    const app = createApp();
    const mac = await mount<PcToolbar>("pc-toolbar", { app });
    expect(query(mac, '[data-action="undo"]').getAttribute("title")).toBe(
      "Undo (⌘Z)",
    );
    expect(
      query(mac, '[data-action="redo"]').getAttribute("aria-keyshortcuts"),
    ).toBe("Shift+Meta+Z");
    platform.mockReturnValue("Win32");
    const windows = await mount<PcToolbar>("pc-toolbar", { app });
    expect(query(windows, '[data-action="undo"]').getAttribute("title")).toBe(
      "Undo (^Z)",
    );
    expect(
      query(windows, '[data-action="undo"]').getAttribute("aria-keyshortcuts"),
    ).toBe("Control+Z");
    expect(query(windows, '[data-action="redo"]').getAttribute("title")).toBe(
      "Redo (⇧^Z)",
    );
    platform.mockRestore();
  });

  it("should name tools with their shortcuts, in the chosen language", async () => {
    const app = createApp();
    const element = await mount<PcToolbar>("pc-toolbar", { app });
    const brush = query(element, `[data-tool="${Tool.Brush}"]`);
    expect([brush.title, brush.getAttribute("aria-label")]).toEqual([
      "Brush (B)",
      "Brush (B)",
    ]);
    expect(query(element, `[data-tool="${Tool.CircleLasso}"]`).title).toBe(
      "Circle lasso (⇧M)",
    );
    expect(query(element, `[data-tool="${Tool.Pan}"]`).title).toBe(
      "Pan (Space)",
    );
    element.translations.addStrings("en-US", {
      "paintCanvas.tool.brush": "Paintbrush",
    });
    await element.updateComplete;
    expect(brush.title).toBe("Paintbrush (B)");
    element.translations.addStrings("en-US", {
      "paintCanvas.tool.brush": "Brush",
    });
  });

  it("should show the user's keyboard shortcuts, and only the name for a tool without one", async () => {
    const app = createApp();
    const element = await mount<PcToolbar>("pc-toolbar", { app });
    app.shortcuts.set("tool-brush", { key: "p" });
    app.shortcuts.set("tool-eraser", null);
    await element.updateComplete;
    expect(query(element, `[data-tool="${Tool.Brush}"]`).title).toBe(
      "Brush (P)",
    );
    expect(query(element, `[data-tool="${Tool.Eraser}"]`).title).toBe("Eraser");
  });

  it("should leave out the app menu button when asked", async () => {
    const element = await mount<PcToolbar>("pc-toolbar", {
      app: createApp(),
      menu: false,
    });
    expect(queryAll(element, `[data-panel="${Panel.Menu}"]`)).toHaveLength(0);
  });
});
