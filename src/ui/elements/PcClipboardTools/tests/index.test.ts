import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import {
  CLIPBOARD_MENU_BELOW,
  CLIPBOARD_TOOLS,
  type PcClipboardTools,
} from "..";
import type { PcButtonMenu } from "../../PcButtonMenu";
import type { PcContextMenu } from "../../PcContextMenu";
import { Tool } from "../../../../lib/classes/PaintCanvas";
import { mount, query, queryAll } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

/** The clipboard tools' button menu */
const buttonMenu = (element: PcClipboardTools) =>
  query<PcButtonMenu>(element, "pc-button-menu");

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
    expect(queryAll(empty, "pc-button-menu")).toHaveLength(0);
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
    "should cut, copy, copy merged (with a mask) and paste (with copied image data) for tool %s",
    async (tool) => {
      const { app, element } = await setup(tool);
      expect(element.hidden).toBe(false);
      const menu = buttonMenu(element);
      expect([menu.size, menu.menuBelow, menu.menu]).toEqual([
        "pill-s",
        CLIPBOARD_MENU_BELOW,
        false,
      ]);
      expect(CLIPBOARD_MENU_BELOW).toBe(900);
      const button = (name: string) =>
        query<HTMLButtonElement>(buttonMenu(element), `button.${name}`);
      expect(
        queryAll(menu, "button").map((b) => b.textContent!.trim()),
      ).toEqual(["Cut", "Copy", "Copy merged", "Paste"]);
      expect(button("cut").classList).toContain("pill-s");
      const names = ["cut", "copy", "copy-merged", "paste"];
      expect(names.map((name) => button(name).disabled)).toEqual([
        true,
        true,
        true,
        true,
      ]);
      const cut = vi.spyOn(app, "cut").mockImplementation(() => undefined);
      const copy = vi.spyOn(app, "copy").mockReturnValue(undefined);
      const copyMerged = vi.spyOn(app, "copyMerged").mockReturnValue(undefined);
      const paste = vi.spyOn(app, "paste").mockImplementation(() => undefined);
      app.selection.active = true;
      vi.spyOn(app, "hasClipboard", "get").mockReturnValue(true);
      app.selection.dispatchEvent(new Event("change"));
      await element.updateComplete;
      await buttonMenu(element).updateComplete;
      expect(names.map((name) => button(name).disabled)).toEqual([
        false,
        false,
        false,
        false,
      ]);
      for (const name of names) button(name).click();
      expect(
        [cut, copy, copyMerged, paste].map((spy) => spy.mock.calls.length),
      ).toEqual([1, 1, 1, 1]);
    },
  );

  it("should not cut or copy while a transform is pending", async () => {
    const { app, element } = await setup(Tool.Move);
    app.selection.active = true;
    vi.spyOn(app.transform, "pending", "get").mockReturnValue(true);
    app.selection.dispatchEvent(new Event("change"));
    await element.updateComplete;
    const menu = buttonMenu(element);
    await menu.updateComplete;
    expect(query<HTMLButtonElement>(menu, "button.copy").disabled).toBe(true);
    expect(query<HTMLButtonElement>(menu, "button.copy-merged").disabled).toBe(
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
    await buttonMenu(element).updateComplete;
    expect(queryAll(buttonMenu(element), "button")).toHaveLength(0);
    const menu = query<PcContextMenu>(
      buttonMenu(element),
      "pc-context-menu.more",
    );
    expect(menu.label).toBe("More actions");
    expect(menu.items).toEqual([
      { value: "cut", label: "Cut", disabled: true },
      { value: "copy", label: "Copy", disabled: true },
      { value: "copy-merged", label: "Copy merged", disabled: true },
      { value: "paste", label: "Paste", disabled: true },
    ]);
    const paste = vi.spyOn(app, "paste").mockImplementation(() => undefined);
    const outside = vi.fn();
    document.body.addEventListener("pc-select", outside);
    menu.dispatchEvent(
      new CustomEvent("pc-select", { detail: { value: "paste" } }),
    );
    menu.dispatchEvent(
      new CustomEvent("pc-select", { detail: { value: "unknown" } }),
    );
    expect(paste).toHaveBeenCalledOnce();
    // The choice is handled here
    expect(outside).not.toHaveBeenCalled();
    document.body.removeEventListener("pc-select", outside);
  });
});
