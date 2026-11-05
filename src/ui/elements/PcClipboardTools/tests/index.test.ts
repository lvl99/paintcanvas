import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { CLIPBOARD_TOOLS, type PcClipboardTools } from "..";
import type { PcContextMenu } from "../../PcContextMenu";
import { Tool } from "../../../../lib/classes/PaintCanvas";
import { mount, query, queryAll } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

/** Clipboard tools for an app with a tool selected */
const setup = async (tool: Tool = Tool.RectangleLasso) => {
  const app = createApp();
  app.selectTool(tool);
  const element = await mount<PcClipboardTools>("pc-clipboard-tools", { app });
  return { app, element };
};

describe("pc-clipboard-tools", () => {
  it("should hide without an app, or for tools that don't cut, copy or paste", async () => {
    const empty = await mount<PcClipboardTools>("pc-clipboard-tools");
    expect(empty.hidden).toBe(true);
    expect(queryAll(empty, "button")).toHaveLength(0);
    for (const tool of [Tool.Zoom, Tool.ColourSample, Tool.Pan]) {
      const { element } = await setup(tool);
      expect(element.hidden).toBe(true);
    }
    expect(CLIPBOARD_TOOLS).toEqual([
      Tool.Brush,
      Tool.Eraser,
      Tool.RectangleLasso,
      Tool.CircleLasso,
      Tool.PolygonLasso,
      Tool.FreeformLasso,
      Tool.Move,
    ]);
  });

  it.each(CLIPBOARD_TOOLS)(
    "should cut, copy (with a mask) and paste (with copied image data) for tool %s",
    async (tool) => {
      const { app, element } = await setup(tool);
      expect(element.hidden).toBe(false);
      const button = (name: string) =>
        query<HTMLButtonElement>(element, `button.${name}`);
      expect(
        queryAll(element, "button").map((b) => b.textContent!.trim()),
      ).toEqual(["Cut", "Copy", "Paste"]);
      expect(button("cut").classList).toContain("pill");
      expect(
        ["cut", "copy", "paste"].map((name) => button(name).disabled),
      ).toEqual([true, true, true]);
      const cut = vi.spyOn(app, "cut").mockImplementation(() => undefined);
      const copy = vi.spyOn(app, "copy").mockReturnValue(undefined);
      const paste = vi.spyOn(app, "paste").mockImplementation(() => undefined);
      app.selection.active = true;
      vi.spyOn(app, "hasClipboard", "get").mockReturnValue(true);
      app.selection.dispatchEvent(new Event("change"));
      await element.updateComplete;
      expect(
        ["cut", "copy", "paste"].map((name) => button(name).disabled),
      ).toEqual([false, false, false]);
      button("cut").click();
      button("copy").click();
      button("paste").click();
      expect([cut, copy, paste].map((spy) => spy.mock.calls.length)).toEqual([
        1, 1, 1,
      ]);
    },
  );

  it("should not cut or copy while a transform is pending", async () => {
    const { app, element } = await setup(Tool.Move);
    app.selection.active = true;
    vi.spyOn(app.transform, "pending", "get").mockReturnValue(true);
    app.selection.dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(query<HTMLButtonElement>(element, "button.copy").disabled).toBe(
      true,
    );
  });

  it("should show and hide as the tool changes", async () => {
    const { app, element } = await setup(Tool.Brush);
    app.selectTool(Tool.Zoom);
    await element.updateComplete;
    expect(element.hidden).toBe(true);
    app.selectTool(Tool.Eraser);
    await element.updateComplete;
    expect(element.hidden).toBe(false);
  });

  it("should be one ⋮ menu while narrow", async () => {
    const { app, element } = await setup();
    element.narrow = true;
    await element.updateComplete;
    expect(queryAll(element, "button")).toHaveLength(0);
    const menu = query<PcContextMenu>(element, "pc-context-menu.more");
    expect(menu.label).toBe("More actions");
    expect(menu.items).toEqual([
      { value: "cut", label: "Cut", disabled: true },
      { value: "copy", label: "Copy", disabled: true },
      { value: "paste", label: "Paste", disabled: true },
    ]);
    const paste = vi.spyOn(app, "paste").mockImplementation(() => undefined);
    menu.dispatchEvent(
      new CustomEvent("pc-select", { detail: { value: "paste" } }),
    );
    menu.dispatchEvent(
      new CustomEvent("pc-select", { detail: { value: "unknown" } }),
    );
    expect(paste).toHaveBeenCalledOnce();
  });
});
