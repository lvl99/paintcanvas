import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import "..";
import type { PcShortcutSettings } from "..";
import ShortcutSettings from "../../../../lib/classes/ShortcutSettings";
import { events, mount, query, queryAll } from "../../../../testing/elements";

beforeEach(() => {
  // Key combinations are read and written as on a Mac
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** The settings element for new keyboard shortcut settings */
const setup = async () => {
  const settings = new ShortcutSettings();
  const element = await mount<PcShortcutSettings>("pc-shortcut-settings", {
    settings,
  });
  const toasts = events<{ message: string; kind: string }>(element, "pc-toast");
  const field = (id: string) =>
    query<HTMLInputElement>(element, `input[data-id="${id}"]`);
  const remove = (id: string) =>
    query<HTMLButtonElement>(element, `button.remove[data-id="${id}"]`);
  return { settings, element, toasts, field, remove };
};

/** Press a key in a field, returning the event */
const press = (
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
  type = "keydown",
) => {
  const event = new KeyboardEvent(type, {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe("pc-shortcut-settings", () => {
  it("should render nothing without settings", async () => {
    const element = await mount<PcShortcutSettings>("pc-shortcut-settings");
    expect(element.shadowRoot!.querySelector("section")).toBeNull();
  });

  it("should list every action in its group, with its key combination", async () => {
    const { element, field } = await setup();
    expect(queryAll(element, "h3").map((h) => h.textContent?.trim())).toEqual([
      "Tools",
      "Brushes & erasers",
      "Masking",
      "Fills and colors",
      "View",
      "Layers",
      "Clipboard",
      "History",
      "General",
    ]);
    expect(field("tool-brush").value).toBe("b");
    expect(field("pan").value).toBe("space");
    expect(field("invert-selection").value).toBe("shift cmd i");
    expect(
      query(element, 'label[for="combo-tool-circle-mask"]').textContent,
    ).toBe("Circle mask");
    expect(field("tool-brush").readOnly).toBe(true);
    expect(field("tool-brush").getAttribute("aria-description")).toBe(
      "Press the keys to use",
    );
  });

  it("should show fixed actions without letting them be changed", async () => {
    const { element } = await setup();
    const fixed = (id: string) => query(element, `span.combo[data-id="${id}"]`);
    expect(fixed("delete").textContent).toBe("delete, backspace");
    expect(fixed("cut").textContent).toBe("cmd x");
    expect(fixed("paste").textContent).toBe("cmd v");
    expect(fixed("undo").getAttribute("aria-description")).toBe(
      "Can't be changed",
    );
    expect(fixed("undo").getAttribute("aria-labelledby")).toBe("name-undo");
    expect(query(element, "#name-layer-opacity-30").textContent).toBe(
      "Set layer opacity to 30%",
    );
    expect(queryAll(element, 'input[data-id="undo"]')).toHaveLength(0);
    expect(queryAll(element, 'button.remove[data-id="undo"]')).toHaveLength(0);
  });

  it("should record the keys pressed in a field, keeping them from the shortcuts", async () => {
    const { settings, element, field } = await setup();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    const event = press(field("tool-brush"), "P", { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(shortcut).not.toHaveBeenCalled();
    expect(settings.combo("tool-brush")).toEqual({ key: "p", shift: true });
    await element.updateComplete;
    expect(field("tool-brush").value).toBe("shift p");
    window.removeEventListener("keydown", shortcut);
  });

  it("should show the modifiers held while recording, until they are let go", async () => {
    const { settings, element, field } = await setup();
    const input = field("tool-brush");
    press(input, "Shift", { shiftKey: true });
    press(input, "Meta", { shiftKey: true, metaKey: true });
    await element.updateComplete;
    expect(input.value).toBe("shift cmd");
    press(input, "Shift", { metaKey: true }, "keyup");
    await element.updateComplete;
    expect(input.value).toBe("cmd");
    press(input, "Meta", {}, "keyup");
    await element.updateComplete;
    expect(input.value).toBe("b");
    // Leaving the field stops recording
    press(input, "Alt", { altKey: true });
    input.dispatchEvent(new Event("blur"));
    await element.updateComplete;
    expect(input.value).toBe("b");
    expect(settings.combo("tool-brush")).toEqual({ key: "b" });
    // Keys let go while not recording change nothing
    press(input, "Alt", {}, "keyup");
    await element.updateComplete;
    expect(element.recording).toBeUndefined();
  });

  it("should leave Tab and Escape to move focus and close", async () => {
    const { settings, field } = await setup();
    expect(press(field("tool-brush"), "Tab").defaultPrevented).toBe(false);
    expect(press(field("tool-brush"), "Escape").defaultPrevented).toBe(false);
    expect(settings.combo("tool-brush")).toEqual({ key: "b" });
  });

  it("should say when a key combination moves from another action", async () => {
    const { settings, element, field, toasts } = await setup();
    press(field("tool-brush"), "e");
    expect(settings.combo("tool-eraser")).toBeNull();
    await element.updateComplete;
    expect(query(element, ".status").textContent).toBe(
      "e moved from Eraser to Brush",
    );
    expect(query(element, ".status").getAttribute("role")).toBe("status");
    expect(toasts).toEqual([
      { message: "e moved from Eraser to Brush", kind: "info" },
    ]);
    expect(field("tool-eraser").value).toBe("");
    expect(field("tool-eraser").placeholder).toBe("None");
  });

  it("should say when a fixed action uses a key combination, leaving it as it was", async () => {
    const { settings, element, field, toasts } = await setup();
    press(field("deselect"), "z", { metaKey: true });
    expect(settings.combo("deselect")).toEqual({ key: "d", cmd: true });
    await element.updateComplete;
    expect(query(element, ".status").textContent).toBe(
      "cmd z is used by Undo, which can't be changed",
    );
    expect(toasts.map((toast) => toast.message)).toEqual([
      "cmd z is used by Undo, which can't be changed",
    ]);
  });

  it("should say nothing for a key combination no other action has", async () => {
    const { element, field, toasts } = await setup();
    press(field("tool-brush"), "e");
    press(field("tool-brush"), "q");
    await element.updateComplete;
    expect(query(element, ".status").textContent).toBe("");
    expect(toasts).toHaveLength(1);
  });

  it("should remove a key combination with its ⨉ button", async () => {
    const { settings, element, remove } = await setup();
    expect(remove("deselect").getAttribute("aria-label")).toBe(
      "Remove the Deselect shortcut",
    );
    remove("deselect").click();
    expect(settings.combo("deselect")).toBeNull();
    await element.updateComplete;
    expect(remove("deselect").disabled).toBe(true);
  });

  it("should go back to the default key combinations", async () => {
    const { settings, element, field } = await setup();
    settings.set("tool-brush", { key: "p" });
    query<HTMLButtonElement>(element, "button.reset").click();
    await element.updateComplete;
    expect(field("tool-brush").value).toBe("b");
    expect(query(element, ".status").textContent).toBe(
      "Keyboard shortcuts reset to defaults",
    );
  });
});
