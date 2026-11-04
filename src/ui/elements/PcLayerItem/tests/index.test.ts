import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import type { PcDialog } from "../../PcDialog";
import type { PcContextMenu } from "../../PcContextMenu";
import {
  DRAG_THRESHOLD,
  LAYER_ACTIONS,
  LAYER_DRAG_EVENT,
  MENU_MARGIN,
  THUMBNAIL_SIZE,
  menuTop,
  type LayerDragDetail,
  type PcLayerItem,
} from "..";
import { CHECKER_DARK } from "../../../../lib/rendering/checkerboard";
import { createRecordingContext } from "../../../../testing/recordingContext";
import type Layer from "../../../../lib/classes/Layer";
import { BlendMode } from "../../../../lib/classes/Layer";
import {
  mount,
  pointerEvent,
  query,
  queryAll,
} from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

/** Mount a row for the app's active layer (on top of a second layer) */
const mountItem = async () => {
  const app = createApp();
  const stack = app.layers;
  stack.create();
  const layer = stack.active;
  const element = await mount<PcLayerItem>("pc-layer-item", { stack, layer });
  return { app, stack, layer, element };
};

/** The row's reorder handle: a context menu */
const handleOf = (element: PcLayerItem) =>
  query<PcContextMenu>(element, ".handle");

/** The button the handle shows */
const handleButton = (element: PcLayerItem) =>
  query<HTMLButtonElement>(handleOf(element), "button");

/** Open the context menu with a right-click on the handle, returning the event */
const rightClick = async (element: PcLayerItem) => {
  const event = new MouseEvent("contextmenu", { cancelable: true });
  handleButton(element).dispatchEvent(event);
  await element.updateComplete;
  await handleOf(element).updateComplete;
  return event;
};

/** The context menu's items */
const menuItems = (element: PcLayerItem) =>
  queryAll<HTMLButtonElement>(handleOf(element).menu!, "button[data-value]");

/** One of the context menu's items */
const menuItem = (element: PcLayerItem, action: string) =>
  query<HTMLButtonElement>(handleOf(element).menu!, `[data-value="${action}"]`);

/** Open the context menu and click an action */
const runFromMenu = async (element: PcLayerItem, action: string) => {
  await rightClick(element);
  menuItem(element, action).click();
  await element.updateComplete;
};

describe("pc-layer-item", () => {
  it("should render nothing without a stack and layer", async () => {
    const element = await mount<PcLayerItem>("pc-layer-item");
    expect(queryAll(element, "input")).toHaveLength(0);
    element.runAction("duplicate");
    expect(element.menuOpen).toBe(false);
  });

  it("should show the layer's settings and bold the active layer's name", async () => {
    const { element, stack } = await mountItem();
    expect(query<HTMLInputElement>(element, ".name").value).toBe("Layer 2");
    expect(query(element, ".name").classList.contains("active")).toBe(true);
    stack.select(stack.layers[1]!.id);
    await element.updateComplete;
    expect(query(element, ".name").classList.contains("active")).toBe(false);
  });

  it("should select the layer when clicked", async () => {
    const { element, stack, layer } = await mountItem();
    stack.select(stack.layers[1]!.id);
    query(element, ".thumbnail").click();
    expect(stack.active).toBe(layer);
  });

  it("should rename the layer, reverting empty names", async () => {
    const { element, layer } = await mountItem();
    const input = query<HTMLInputElement>(element, ".name");
    input.value = "Ink";
    input.dispatchEvent(new Event("change"));
    expect(layer.name).toBe("Ink");
    input.value = "  ";
    input.dispatchEvent(new Event("change"));
    expect(layer.name).toBe("Ink");
    expect(input.value).toBe("Ink");
  });

  it("should change opacity, blend mode, alpha lock and visibility", async () => {
    const { element, layer } = await mountItem();
    const opacity = query<HTMLInputElement>(element, "input[type=range]");
    opacity.value = "40";
    opacity.dispatchEvent(new Event("change"));
    const blend = query<HTMLSelectElement>(element, "select");
    blend.value = BlendMode.Multiply;
    blend.dispatchEvent(new Event("change"));
    query(element, ".alpha-lock").click();
    query(element, ".visibility").click();
    expect(layer.toConfig()).toMatchObject({
      opacity: 0.4,
      blendMode: BlendMode.Multiply,
      alphaLock: true,
      visible: false,
    });
  });

  it("should show the alpha lock and visibility states with their icons", async () => {
    const { element } = await mountItem();
    const icon = (selector: string) =>
      query(element, `${selector} img`).getAttribute("src");
    expect(icon(".alpha-lock")).toMatch(/unlocked\.png$/);
    expect(icon(".visibility")).toMatch(/visible\.png$/);
    query(element, ".alpha-lock").click();
    query(element, ".visibility").click();
    await element.updateComplete;
    expect(icon(".alpha-lock")).toMatch(/\/locked\.png$/);
    expect(icon(".visibility")).toMatch(/hidden\.png$/);
  });

  it("should open the context menu on right-click with every action", async () => {
    const { element } = await mountItem();
    const event = await rightClick(element);
    expect(event.defaultPrevented).toBe(true);
    expect(element.menuOpen).toBe(true);
    expect(menuItems(element)).toHaveLength(LAYER_ACTIONS.length);
  });

  it("should duplicate and reorder from the context menu", async () => {
    const { element, stack } = await mountItem();
    await runFromMenu(element, "duplicate");
    expect(stack.layers.map((l) => l.name)).toEqual([
      "Layer 2 copy",
      "Layer 2",
      "Layer 1",
    ]);
    expect(element.menuOpen).toBe(false);

    await runFromMenu(element, "down");
    expect(stack.layers.map((l) => l.name)).toEqual([
      "Layer 2 copy",
      "Layer 1",
      "Layer 2",
    ]);
    await runFromMenu(element, "up");
    await runFromMenu(element, "top");
    expect(stack.layers[0]!.name).toBe("Layer 2");
    await runFromMenu(element, "bottom");
    expect(stack.layers.at(-1)!.name).toBe("Layer 2");
  });

  it("should label clearing and deleting as asking first, and ask before doing them", async () => {
    const { element, stack, layer } = await mountItem();
    const clear = vi.spyOn(stack, "clear");
    const dialog = () => queryAll<PcDialog>(element, "pc-dialog")[0];
    for (const [action, label, heading, message, button] of [
      [
        "clear",
        "Clear…",
        "Clear layer",
        'Clear all image data on "Layer 2"?',
        "Clear",
      ],
      ["delete", "Delete…", "Delete layer", 'Delete "Layer 2"?', "Delete"],
    ] as const) {
      await rightClick(element);
      expect(menuItem(element, action).textContent?.trim()).toBe(label);
      element.runAction(action);
      await element.updateComplete;
      expect([dialog()?.heading, dialog()?.message]).toEqual([
        heading,
        message,
      ]);
      expect(
        queryAll(dialog()!, "pc-button").map((b) => [
          b.textContent?.trim(),
          b.getAttribute("variant"),
        ]),
      ).toEqual([
        [button, "accent"],
        ["Dismiss", "dismiss"],
      ]);
      // Dismissing (or Escape) changes nothing
      query(dialog()!, `pc-button[data-value="cancel"]`).click();
      await element.updateComplete;
      expect(dialog()).toBeUndefined();
    }
    expect(clear).not.toHaveBeenCalled();
    expect(stack.layers).toHaveLength(2);

    await runFromMenu(element, "clear");
    query(dialog()!, `pc-button[data-value="clear"]`).click();
    expect(clear).toHaveBeenCalledWith(layer.id);
    await runFromMenu(element, "delete");
    query(dialog()!, `pc-button[data-value="delete"]`).click();
    await element.updateComplete;
    expect(stack.layers).toHaveLength(1);
    expect(dialog()).toBeUndefined();
  });

  it("should not offer to delete the only layer", async () => {
    const app = createApp();
    const element = await mount<PcLayerItem>("pc-layer-item", {
      stack: app.layers,
      layer: app.layers.active,
    });
    await rightClick(element);
    expect(menuItem(element, "delete").disabled).toBe(true);
    element.runAction("delete");
    await element.updateComplete;
    expect(queryAll(element, "pc-dialog")).toHaveLength(0);
  });

  it("should do nothing when confirmed without a layer", async () => {
    const element = await mount<PcLayerItem>("pc-layer-item", {});
    expect(() => element.confirmed("delete")).not.toThrow();
  });

  it("should merge the layer down after asking, and not from the bottom layer", async () => {
    const { stack, layer, element } = await mountItem();
    const merge = vi.spyOn(stack, "mergeDown");
    await runFromMenu(element, "merge");
    const dialog = () => queryAll(element, "pc-dialog")[0];
    expect(dialog()!.getAttribute("message")).toBe(
      "Are you sure you want to merge this layer with the layer under it?",
    );
    expect(
      queryAll(dialog()!, "pc-button").map((b) => b.textContent?.trim()),
    ).toEqual(["Merge layer", "Dismiss"]);
    // Dismissing changes nothing
    query(dialog()!, `pc-button[data-value="cancel"]`).click();
    await element.updateComplete;
    expect(dialog()).toBeUndefined();
    expect(merge).not.toHaveBeenCalled();
    await runFromMenu(element, "merge");
    query(dialog()!, `pc-button[data-value="merge"]`).click();
    await element.updateComplete;
    expect(merge).toHaveBeenCalledWith(layer.id);
    expect(stack.layers).toHaveLength(1);
    expect(dialog()).toBeUndefined();
  });

  it("should only offer moves the layer can make: not up from the top, nor down or merging from the bottom", async () => {
    const app = createApp();
    const stack = app.layers;
    stack.create();
    stack.create();
    const disabled = async (layer: (typeof stack.layers)[number]) => {
      const element = await mount<PcLayerItem>("pc-layer-item", {
        stack,
        layer,
      });
      await rightClick(element);
      const actions = menuItems(element)
        .filter((button) => button.disabled)
        .map((button) => button.dataset.value);
      element.remove();
      return actions;
    };
    const [top, middle, bottom] = stack.layers as [Layer, Layer, Layer];
    expect(await disabled(top)).toEqual(["up", "top"]);
    expect(await disabled(middle)).toEqual([]);
    expect(await disabled(bottom)).toEqual(["merge", "down", "bottom"]);
    // Asked from code anyway: nothing happens
    const element = await mount<PcLayerItem>("pc-layer-item", {
      stack,
      layer: top,
    });
    const order = stack.layers.map((layer) => layer.id);
    element.runAction("up");
    element.runAction("top");
    element.layer = bottom;
    element.runAction("down");
    element.runAction("bottom");
    expect(stack.layers.map((layer) => layer.id)).toEqual(order);
    expect(element.canRun("duplicate")).toBe(true);
    element.stack = undefined;
    expect(element.canRun("duplicate")).toBe(false);
  });

  it("should not offer to merge down the bottom layer", async () => {
    const app = createApp();
    const element = await mount<PcLayerItem>("pc-layer-item", {
      stack: app.layers,
      layer: app.layers.active,
    });
    await rightClick(element);
    expect(menuItem(element, "merge").disabled).toBe(true);
    element.runAction("merge");
    await element.updateComplete;
    expect(queryAll(element, "pc-dialog")).toHaveLength(0);
  });

  it("should drag the layer by its handle once the pointer has moved far enough, capturing it", async () => {
    const { element, layer } = await mountItem();
    const handle = handleButton(element);
    handle.setPointerCapture = vi.fn();
    const drags: LayerDragDetail[] = [];
    document.body.addEventListener(LAYER_DRAG_EVENT, (event) =>
      drags.push((event as CustomEvent<LayerDragDetail>).detail),
    );
    const phases = () => drags.map(({ phase, x, y }) => [phase, x, y]);
    expect(DRAG_THRESHOLD).toBe(4);

    // Only the main button drags
    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10, { button: 2 }));
    handle.dispatchEvent(pointerEvent("pointermove", 30, 30));
    expect(drags).toEqual([]);

    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
    handle.dispatchEvent(pointerEvent("pointermove", 12, 12));
    // Another pointer is ignored
    handle.dispatchEvent(pointerEvent("pointermove", 40, 40, { pointerId: 2 }));
    expect(drags).toEqual([]);
    handle.dispatchEvent(pointerEvent("pointermove", 10, 15));
    handle.dispatchEvent(pointerEvent("pointermove", 10, 30));
    handle.dispatchEvent(pointerEvent("pointerup", 10, 35, { pointerId: 2 }));
    handle.dispatchEvent(pointerEvent("pointerup", 10, 35));
    expect(phases()).toEqual([
      ["start", 10, 15],
      ["move", 10, 15],
      ["move", 10, 30],
      ["end", 10, 35],
    ]);
    expect(drags[0]!.layer).toBe(layer);
    // The click that ends a drag doesn't open the menu; the next one does
    handleButton(element).click();
    await element.updateComplete;
    expect(element.menuOpen).toBe(false);
    handleButton(element).click();
    await element.updateComplete;
    expect(element.menuOpen).toBe(true);
  });

  it("should open the menu on a click, tap or Enter on the handle without dragging", async () => {
    const { element } = await mountItem();
    const handle = handleButton(element);
    handle.setPointerCapture = vi.fn();
    const drags = vi.fn();
    element.addEventListener(LAYER_DRAG_EVENT, drags);
    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    handle.dispatchEvent(pointerEvent("pointermove", 11, 12));
    handle.dispatchEvent(pointerEvent("pointerup", 11, 12));
    // A keyboard press (Enter or Space) on the button is a click too
    handleButton(element).click();
    await element.updateComplete;
    await handleOf(element).updateComplete;
    expect(drags).not.toHaveBeenCalled();
    expect(element.menuOpen).toBe(true);
    expect(handleButton(element).getAttribute("aria-expanded")).toBe("true");
    expect(handleButton(element).getAttribute("aria-label")).toBe(
      "Reorder Layer 2: drag, or press for actions",
    );
    handleButton(element).click();
    await element.updateComplete;
    expect(element.menuOpen).toBe(false);
  });

  it("should cancel a drag on Escape or when the browser cancels the pointer", async () => {
    const { element } = await mountItem();
    const handle = handleButton(element);
    handle.setPointerCapture = vi.fn();
    const phases: string[] = [];
    element.addEventListener(LAYER_DRAG_EVENT, (event) =>
      phases.push((event as CustomEvent<LayerDragDetail>).detail.phase),
    );
    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    handle.dispatchEvent(pointerEvent("pointermove", 10, 30));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // The pointer is no longer followed
    handle.dispatchEvent(pointerEvent("pointermove", 10, 40));
    handle.dispatchEvent(pointerEvent("pointerup", 10, 40));
    handleButton(element).click();
    expect(element.menuOpen).toBe(false);
    expect(phases).toEqual(["start", "move", "cancel"]);

    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    handle.dispatchEvent(pointerEvent("pointermove", 10, 30));
    handle.dispatchEvent(
      pointerEvent("pointercancel", 10, 30, { pointerId: 2 }),
    );
    handle.dispatchEvent(pointerEvent("pointercancel", 10, 30));
    expect(phases).toEqual([
      "start",
      "move",
      "cancel",
      "start",
      "move",
      "cancel",
    ]);
    // A cancelled press that never dragged sends nothing
    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    handle.dispatchEvent(pointerEvent("pointercancel", 10, 10));
    expect(phases).toHaveLength(6);
    // Escape with nothing pressed does nothing
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(phases).toHaveLength(6);
    // Removed mid-drag, it stops listening for Escape
    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    handle.dispatchEvent(pointerEvent("pointermove", 10, 30));
    element.remove();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(phases).toHaveLength(8);
  });

  it("should fade while dragged and show what dropping would do", async () => {
    const { element } = await mountItem();
    expect(element.hasAttribute("dragging")).toBe(false);
    element.dragging = true;
    element.dropAction = "duplicate";
    await element.updateComplete;
    expect(element.hasAttribute("dragging")).toBe(true);
    expect(element.getAttribute("drop-action")).toBe("duplicate");
    element.dropAction = undefined;
    await element.updateComplete;
    expect(element.hasAttribute("drop-action")).toBe(false);
  });

  it("should draw the layer on a checkerboard thumbnail, keeping its proportions", async () => {
    const recording = createRecordingContext();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() =>
      recording.ctx) as unknown as typeof original;
    const app = createApp();
    app.setCanvasSize(200, 100);
    const element = await mount<PcLayerItem>("pc-layer-item", {
      stack: app.layers,
      layer: app.layers.active,
      pixelRatio: () => 2,
    });
    HTMLCanvasElement.prototype.getContext = original;
    const canvas = query<HTMLCanvasElement>(element, "canvas.thumbnail");
    expect([canvas.width, canvas.height]).toEqual([
      THUMBNAIL_SIZE * 2,
      THUMBNAIL_SIZE * 2,
    ]);
    expect(recording.calls).toContainEqual(["set:fillStyle", CHECKER_DARK]);
    expect(recording.calls).toContainEqual([
      "drawImage",
      app.layers.active.canvas,
      0,
      15,
      60,
      30,
    ]);
  });

  it("should wait for a pause in drawing to redraw the thumbnail, given background work", async () => {
    const { app, element } = await mountItem();
    const draw = vi.spyOn(element, "drawThumbnail");
    element.background = app.background;
    app.background.strokeStarted();
    await element.updateComplete;
    expect(draw).not.toHaveBeenCalled();
    expect(app.background.pending).toEqual([`thumbnail ${element.layer!.id}`]);
    app.background.strokeEnded();
    await vi.waitFor(() => expect(draw).toHaveBeenCalledOnce());
  });

  it("should skip the thumbnail without a 2D context", async () => {
    const { element } = await mountItem();
    query<HTMLCanvasElement>(element, "canvas.thumbnail").getContext = (() =>
      null) as unknown as HTMLCanvasElement["getContext"];
    expect(() => element.drawThumbnail()).not.toThrow();
  });

  it("should use the device pixel ratio by default", () => {
    const element = document.createElement("pc-layer-item") as PcLayerItem;
    vi.stubGlobal("devicePixelRatio", 2);
    expect(element.pixelRatio()).toBe(2);
    vi.stubGlobal("devicePixelRatio", 0);
    expect(element.pixelRatio()).toBe(1);
    vi.unstubAllGlobals();
  });

  it("should close the context menu when it asks to (after choosing, Escape or a press outside)", async () => {
    const { element } = await mountItem();
    await rightClick(element);
    handleOf(element).menu!.close();
    await element.updateComplete;
    expect(element.menuOpen).toBe(false);
    // Opening it again from code opens the context menu
    element.menuOpen = true;
    await element.updateComplete;
    expect(handleOf(element).open).toBe(true);
  });

  it("should open the context menu beside the handle, named for the layer's actions", async () => {
    const { element } = await mountItem();
    await rightClick(element);
    expect(handleOf(element).placement).toBe("beside");
    expect(handleOf(element).menu!.label).toBe("Layer actions");
  });

  it("should move the context menu up to fit in the window, but not above its top", () => {
    expect(menuTop(100, 300, 800)).toBe(100);
    expect(menuTop(700, 300, 800)).toBe(800 - MENU_MARGIN - 300);
    expect(menuTop(700, 900, 800)).toBe(MENU_MARGIN);
  });

  it("should offer Create mask first in the context menu", async () => {
    const { element } = await mountItem();
    await rightClick(element);
    expect(menuItems(element)[0]!.textContent?.trim()).toBe("Create mask");
  });

  it("should show nothing without a layer", async () => {
    const element = await mount<PcLayerItem>("pc-layer-item");
    expect(queryAll(element, "button")).toHaveLength(0);
  });
});
