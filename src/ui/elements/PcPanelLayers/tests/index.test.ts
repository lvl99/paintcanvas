import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { dropSlot, isInside, type PcPanelLayers } from "..";
import type { PcLayerItem, LayerDragDetail } from "../../PcLayerItem";
import { LAYER_DRAG_EVENT } from "../../PcLayerItem";
import { DEFAULT_MAX_LAYERS as MAX_LAYERS } from "../../../../lib/classes/LayerStack";
import { mount, query, queryAll } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

describe("pc-panel-layers", () => {
  it("should render nothing without an app", async () => {
    const element = await mount<PcPanelLayers>("pc-panel-layers");
    expect(queryAll(element, "button")).toHaveLength(0);
  });

  it("should list layers and create new ones up to the limit", async () => {
    const app = createApp();
    const element = await mount<PcPanelLayers>("pc-panel-layers", { app });
    expect(queryAll(element, "pc-layer-item")).toHaveLength(1);
    expect(query<PcLayerItem>(element, "pc-layer-item").background).toBe(
      app.background,
    );
    for (let i = 1; i < MAX_LAYERS; i++) {
      query(element, "button.new").click();
      await element.updateComplete;
    }
    expect(queryAll(element, "pc-layer-item")).toHaveLength(MAX_LAYERS);
    expect(query<HTMLButtonElement>(element, "button.new").disabled).toBe(true);
  });

  it("should keep only one layer's context menu open at a time", async () => {
    const app = createApp();
    app.layers.create();
    const element = await mount<PcPanelLayers>("pc-panel-layers", { app });
    const [first, second] = queryAll<PcLayerItem>(element, "pc-layer-item");
    const openMenu = async (item: PcLayerItem) => {
      query(query(item, ".handle"), "button").dispatchEvent(
        new MouseEvent("contextmenu", { cancelable: true }),
      );
      await item.updateComplete;
    };
    await openMenu(first!);
    expect(first!.menuOpen).toBe(true);
    await openMenu(second!);
    expect(second!.menuOpen).toBe(true);
    expect(first!.menuOpen).toBe(false);
  });

  it("should mask a layer's alpha when its name is Cmd/Ctrl-clicked", async () => {
    const app = createApp();
    const fromAlpha = vi
      .spyOn(app.selection, "fromAlpha")
      .mockImplementation(() => undefined);
    const element = await mount<PcPanelLayers>("pc-panel-layers", { app });
    const item = query<PcLayerItem>(element, "pc-layer-item");
    const name = query(item, ".name");
    name.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(fromAlpha).not.toHaveBeenCalled();
    name.dispatchEvent(
      new MouseEvent("click", { bubbles: true, metaKey: true }),
    );
    name.dispatchEvent(
      new MouseEvent("click", { bubbles: true, ctrlKey: true, altKey: true }),
    );
    expect(fromAlpha).toHaveBeenNthCalledWith(1, app.layers.active, "replace");
    expect(fromAlpha).toHaveBeenNthCalledWith(2, app.layers.active, "subtract");
  });

  it("should mask a layer's alpha when its thumbnail is Cmd/Ctrl-clicked or Create mask is chosen", async () => {
    const app = createApp();
    const fromAlpha = vi
      .spyOn(app.selection, "fromAlpha")
      .mockImplementation(() => undefined);
    const element = await mount<PcPanelLayers>("pc-panel-layers", { app });
    const item = query<PcLayerItem>(element, "pc-layer-item");
    query(item, ".thumbnail").dispatchEvent(
      new MouseEvent("click", { bubbles: true, metaKey: true, shiftKey: true }),
    );
    expect(fromAlpha).toHaveBeenLastCalledWith(app.layers.active, "add");

    // Other controls in the row do not make a mask
    query(item, "input[type=range]").dispatchEvent(
      new MouseEvent("click", { bubbles: true, metaKey: true }),
    );
    expect(fromAlpha).toHaveBeenCalledTimes(1);

    item.runAction("mask");
    expect(fromAlpha).toHaveBeenLastCalledWith(app.layers.active, "replace");
    expect(fromAlpha).toHaveBeenCalledTimes(2);
  });
});

describe("dropSlot and isInside", () => {
  const rows = [
    { top: 0, height: 30 },
    { top: 30, height: 30 },
    { top: 60, height: 30 },
  ];

  it("should place a dragged layer before the first row whose middle is below the pointer, or last", () => {
    expect(dropSlot(rows, 5)).toBe(0);
    expect(dropSlot(rows, 16)).toBe(1);
    expect(dropSlot(rows, 44)).toBe(1);
    expect(dropSlot(rows, 46)).toBe(2);
    expect(dropSlot(rows, 200)).toBe(3);
    expect(dropSlot([], 10)).toBe(0);
  });

  it("should leave the ghost out, so rows after it count from where they would be without it", () => {
    // A 30px ghost before the second row pushes it and the third down
    const shifted = [
      { top: 0, height: 30 },
      { top: 60, height: 30 },
      { top: 90, height: 30 },
    ];
    const ghost = { top: 30, height: 30 };
    expect(dropSlot(shifted, 44, ghost)).toBe(1);
    expect(dropSlot(shifted, 46, ghost)).toBe(2);
  });

  it("should check whether a point is inside a rectangle", () => {
    const rect = new DOMRect(10, 10, 20, 20);
    expect(isInside(rect, 10, 30)).toBe(true);
    expect(isInside(rect, 9, 20)).toBe(false);
    expect(isInside(rect, 20, 31)).toBe(false);
  });
});

describe("pc-panel-layers dragging", () => {
  /**
   * A menu of three layers laid out as in the app: 30px rows from the top, then New Layer (jsdom has no layout).
   */
  const setup = async (layerCount = 3) => {
    const app = createApp();
    for (let i = 1; i < layerCount; i++) app.layers.create();
    const element = await mount<PcPanelLayers>("pc-panel-layers", { app });
    const items = () => queryAll<PcLayerItem>(element, "pc-layer-item");
    const lay = () => {
      element.getBoundingClientRect = () => new DOMRect(0, 0, 275, 200);
      items().forEach((item, i) => {
        item.getBoundingClientRect = () => new DOMRect(0, i * 30, 275, 30);
      });
      const button = element.shadowRoot!.querySelector("button.new");
      if (button)
        button.getBoundingClientRect = () =>
          new DOMRect(0, items().length * 30, 275, 50);
    };
    lay();
    /** Fire a drag phase from a row, as its handle does */
    const drag = async (
      item: PcLayerItem,
      phase: LayerDragDetail["phase"],
      x: number,
      y: number,
    ) => {
      item.dispatchEvent(
        new CustomEvent<LayerDragDetail>(LAYER_DRAG_EVENT, {
          detail: { layer: item.layer!, phase, x, y },
          bubbles: true,
          composed: true,
        }),
      );
      await element.updateComplete;
      lay();
    };
    const names = () => app.layers.layers.map((layer) => layer.name);
    /** The list as shown: row names, with the ghost as "[name]" */
    const shown = () =>
      [...element.shadowRoot!.querySelectorAll("pc-layer-item, .ghost")].map(
        (row) =>
          row.matches(".ghost")
            ? `[${row.textContent?.trim()}]`
            : (row as PcLayerItem).layer!.name,
      );
    const announcement = () =>
      query(element, ".announcement").textContent?.trim();
    return { app, element, items, drag, names, shown, announcement };
  };

  it("should show a ghost where the dragged layer would land, then move it there", async () => {
    const { element, items, drag, names, shown, announcement } = await setup();
    expect(names()).toEqual(["Layer 3", "Layer 2", "Layer 1"]);
    const top = items()[0]!;
    await drag(top, "start", 10, 5);
    expect(top.dragging).toBe(true);
    expect(top.dropAction).toBe("move");
    expect(items()[1]!.dragging).toBe(false);
    // The row floats where it was grabbed: 10px across and 5px down its 275px-wide row
    expect([top.style.left, top.style.top, top.style.width]).toEqual([
      "0px",
      "0px",
      "275px",
    ]);
    expect(items()[1]!.getAttribute("style") ?? "").toBe("");
    // The ghost is as tall as the row it replaces, so the list doesn't shift
    expect(query(element, ".ghost").style.height).toBe("30px");
    // Over the top half of the first of the other rows: before it (just after its own faded row)
    expect(shown()).toEqual(["Layer 3", "[Layer 3]", "Layer 2", "Layer 1"]);
    // Over the bottom half of Layer 2 (the dragged row still takes its place above): after it
    await drag(top, "move", 10, 50);
    expect(shown()).toEqual(["Layer 3", "Layer 2", "[Layer 3]", "Layer 1"]);
    // It follows the pointer
    expect([top.style.left, top.style.top]).toEqual(["0px", "45px"]);
    await drag(top, "move", 10, 89);
    await drag(top, "end", 10, 89);
    expect(names()).toEqual(["Layer 2", "Layer 1", "Layer 3"]);
    expect(shown()).toEqual(["Layer 2", "Layer 1", "Layer 3"]);
    expect(element.drag).toBeUndefined();
    expect(top.style.left).toBe("");
    expect(items().every((item) => !item.dragging)).toBe(true);
    const status = query(element, ".announcement");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(announcement()).toBe("Layer 3 moved to position 3 of 3");
  });

  it("should duplicate a layer dropped on New Layer, showing + and highlighting the button", async () => {
    const { element, items, drag, names, shown, announcement } = await setup();
    const middle = items()[1]!;
    await drag(middle, "start", 10, 100);
    expect(middle.dropAction).toBe("duplicate");
    expect(query(element, "button.new").classList.contains("drop-target")).toBe(
      true,
    );
    // The layer stays where it was, and a copy is made, so the ghost stays in its place
    expect(shown()).toEqual(["Layer 3", "Layer 2", "[Layer 2]", "Layer 1"]);
    await drag(middle, "end", 10, 100);
    expect(names()).toEqual(["Layer 3", "Layer 2 copy", "Layer 2", "Layer 1"]);
    expect(announcement()).toBe("Layer 2 duplicated");
    expect(query(element, "button.new").classList.contains("drop-target")).toBe(
      false,
    );
  });

  it("should do nothing when dropped outside the menu, on a full New Layer, or back where it was", async () => {
    const { app, items, drag, names, shown, announcement } = await setup();
    const top = items()[0]!;
    await drag(top, "start", 400, 40);
    expect(top.dropAction).toBe("none");
    // Outside the menu, the ghost stays where the layer was
    expect(shown()).toEqual(["Layer 3", "[Layer 3]", "Layer 2", "Layer 1"]);
    await drag(top, "end", 400, 40);
    expect(names()).toEqual(["Layer 3", "Layer 2", "Layer 1"]);

    await drag(top, "start", 10, 10);
    await drag(top, "end", 10, 10);
    expect(names()).toEqual(["Layer 3", "Layer 2", "Layer 1"]);
    expect(announcement()).toBe("");

    for (let i = app.layers.layers.length; i < MAX_LAYERS; i++)
      app.layers.create();
    await drag(top, "start", 10, 10);
    const below = items().length * 30 + 10;
    await drag(top, "move", 10, below);
    expect(top.dropAction).toBe("none");
    await drag(top, "end", 10, below);
    expect(app.layers.layers).toHaveLength(MAX_LAYERS);
  });

  it("should forget a cancelled drag, and ignore moves and drops without a start", async () => {
    const { element, items, drag, names, shown } = await setup();
    const top = items()[0]!;
    await drag(top, "move", 10, 80);
    await drag(top, "end", 10, 80);
    await drag(top, "cancel", 10, 80);
    expect(names()).toEqual(["Layer 3", "Layer 2", "Layer 1"]);
    await drag(top, "start", 10, 80);
    expect(shown()).toContain("[Layer 3]");
    await drag(top, "cancel", 10, 80);
    expect(element.drag).toBeUndefined();
    expect(shown()).toEqual(["Layer 3", "Layer 2", "Layer 1"]);
    expect(names()).toEqual(["Layer 3", "Layer 2", "Layer 1"]);
  });

  it("should ignore drags once the app is gone", async () => {
    const { element, items, drag } = await setup();
    const top = items()[0]!;
    await drag(top, "start", 10, 5);
    element.app = undefined;
    await drag(top, "end", 10, 80);
    expect(element.drag).toBeUndefined();
  });
});
