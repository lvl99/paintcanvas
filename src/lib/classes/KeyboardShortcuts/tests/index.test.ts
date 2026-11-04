import { describe, it, expect, vi, afterEach } from "vitest";
import KeyboardShortcuts, { SHORTCUT_EVENT } from "..";
import PaintCanvas, { Panel, Tool } from "../../PaintCanvas";
import { createFakeCanvasFactory } from "../../../../testing/fakeCanvas";

const createApp = () =>
  new PaintCanvas({
    createCanvas: createFakeCanvasFactory(),
  });

const press = (
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
) => {
  const event = new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

let shortcuts: KeyboardShortcuts | undefined;
afterEach(() => {
  shortcuts?.detach();
  document.body.replaceChildren();
});

describe("KeyboardShortcuts", () => {
  it("should select tools, then toggle the tool's panel on a second press", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const event = press(window, "e");
    expect(event.defaultPrevented).toBe(true);
    expect([app.tool, app.panel]).toEqual([Tool.Eraser, null]);
    press(window, "E");
    expect(app.panel).toBe(Panel.Eraser);
  });

  it("should resize the brush or eraser only when that tool is selected", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    app.brush.select("round10");
    app.eraser.select("round10");

    press(window, "]");
    expect(app.brush.width).toBe(11);
    press(window, "[");
    expect(app.brush.width).toBe(10);

    press(window, "e");
    press(window, "]");
    expect([app.brush.width, app.eraser.width]).toEqual([10, 11]);

    press(window, "z");
    press(window, "]");
    expect([app.brush.width, app.eraser.width]).toEqual([10, 11]);
  });

  it("should toggle the interface with tab", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    press(window, "Tab");
    expect(app.interfaceVisible).toBe(false);
  });

  it("should dispatch other actions as events on the attached target", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const listener = vi.fn();
    window.addEventListener(SHORTCUT_EVENT, listener);
    press(window, "s", { metaKey: true });
    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      type: "save",
    });
    window.removeEventListener(SHORTCUT_EVENT, listener);
  });

  it("should dispatch events on the app when not attached", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    const listener = vi.fn();
    app.addEventListener(SHORTCUT_EVENT, listener);
    shortcuts.run({ type: "save" });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should undo with cmd+z and redo with shift+cmd+z", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const undo = vi.spyOn(app, "undo");
    const redo = vi.spyOn(app, "redo");
    press(window, "z", { metaKey: true });
    expect(undo).toHaveBeenCalledOnce();
    press(window, "Z", { ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledOnce();
  });

  it("should cut, copy and paste with cmd+x, cmd+c and cmd+v", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const cut = vi.spyOn(app, "cut");
    const copy = vi.spyOn(app, "copy");
    const paste = vi.spyOn(app, "paste");
    press(window, "c", { metaKey: true });
    expect(copy).toHaveBeenCalledOnce();
    press(window, "x", { metaKey: true });
    expect(cut).toHaveBeenCalledOnce();
    press(window, "v", { metaKey: true });
    expect(paste).toHaveBeenCalledOnce();
  });

  it("should delete the masked image data with Delete or Backspace", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const deleteMasked = vi.spyOn(app, "deleteMasked");
    press(window, "Delete");
    press(window, "Backspace");
    expect(deleteMasked).toHaveBeenCalledTimes(2);
  });

  it("should fill with cmd+Backspace and alt+Backspace, and swap colours with x", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const fill = vi.spyOn(app, "fill");
    const deleteMasked = vi.spyOn(app, "deleteMasked");
    press(window, "Backspace", { metaKey: true });
    press(window, "Backspace", { altKey: true });
    expect(fill.mock.calls).toEqual([["foreground"], ["background"]]);
    expect(deleteMasked).not.toHaveBeenCalled();
    press(window, "x");
    expect(app.colours).toEqual({
      foreground: "#ffffff",
      background: "#000000",
    });
  });

  it("should ignore key presses while typing and unknown keys", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    const typing = new KeyboardEvent("keydown", {
      key: "e",
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(typing);
    expect(app.tool).toBe(Tool.Brush);
    expect(typing.defaultPrevented).toBe(false);
    expect(press(window, "q").defaultPrevented).toBe(false);
  });

  it("should handle events that were not dispatched", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    expect(
      shortcuts.handle(new KeyboardEvent("keydown", { key: "e" })),
    ).toEqual({
      type: "tool",
      tool: Tool.Eraser,
    });
  });

  it("should stop listening when detached or re-attached", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    const other = new EventTarget();
    shortcuts.attach(other);
    shortcuts.attach(window);
    press(other, "e");
    expect(app.tool).toBe(Tool.Brush);
    shortcuts.detach();
    press(window, "e");
    expect(app.tool).toBe(Tool.Brush);
  });

  it("should pan while Space is held and return to the selected tool on release", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const down = press(window, " ");
    expect(down.defaultPrevented).toBe(true);
    expect([app.tool, app.activeTool]).toEqual([Tool.Brush, Tool.Pan]);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));
    expect(app.activeTool).toBe(Tool.Pan);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    expect(app.activeTool).toBe(Tool.Brush);
  });

  it("should not hold pan for Space with modifiers", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    press(window, " ", { metaKey: true });
    press(window, " ", { ctrlKey: true });
    press(window, " ", { altKey: true });
    expect(app.activeTool).toBe(Tool.Brush);
  });

  it("should release the held tool when the window loses focus, and stop after detaching", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    press(window, " ");
    window.dispatchEvent(new Event("blur"));
    expect(app.activeTool).toBe(Tool.Brush);
    shortcuts.detach();
    press(window, " ");
    expect(app.activeTool).toBe(Tool.Brush);
  });

  it("should select all and deselect", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    const selectAll = vi
      .spyOn(app.selection, "selectAll")
      .mockImplementation(() => undefined);
    const clear = vi
      .spyOn(app.selection, "clear")
      .mockImplementation(() => undefined);
    shortcuts.run({ type: "select-all" });
    shortcuts.run({ type: "deselect" });
    expect(selectAll).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
  });

  it("should close a polygon on Enter, and otherwise pass Enter and Escape on", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    shortcuts.attach(window);
    const listener = vi.fn();
    window.addEventListener(SHORTCUT_EVENT, listener);
    const applyLasso = vi
      .spyOn(app, "applyLasso")
      .mockImplementation(() => undefined);
    press(window, "Enter");
    expect(listener).toHaveBeenCalledTimes(1);
    app.lasso.down(
      "polygon",
      { x: 0, y: 0 },
      { shiftKey: false, altKey: false },
      false,
    );
    press(window, "Enter");
    expect(applyLasso).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    app.lasso.down(
      "polygon",
      { x: 0, y: 0 },
      { shiftKey: false, altKey: false },
      false,
    );
    press(window, "Escape");
    expect(app.lasso.active).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(SHORTCUT_EVENT, listener);
  });

  it("should apply a pending transform on Enter and cancel it on Escape", () => {
    const app = createApp();
    shortcuts = new KeyboardShortcuts(app);
    const commit = vi
      .spyOn(app, "commitTransform")
      .mockImplementation(() => undefined);
    const cancel = vi.spyOn(app, "cancelTransform");
    Object.defineProperty(app.transform, "pending", { get: () => true });
    shortcuts.run({ type: "commit" });
    shortcuts.run({ type: "cancel" });
    expect(commit).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });
});
