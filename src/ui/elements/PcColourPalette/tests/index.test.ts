import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { LONG_PRESS_MS, channelGradient, type PcColourPalette } from "..";
import type { PcColourPair } from "../../PcColourPair";
import type { PcDialog } from "../../PcDialog";
import type { PcContextMenu } from "../../PcContextMenu";
import { Panel } from "../../../../lib/classes/PaintCanvas";
import { events, mount, query, queryAll } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";
import {
  PALETTE_FILE_FORMAT,
  exportPaletteFile,
} from "../../../../lib/palette";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A palette for a new canvas with a few saved colours, open as the canvas's panel */
const setup = async (colours = ["#ff0000", "#00ff00", "#0000ff"]) => {
  const app = createApp();
  app.palette.set(colours);
  app.togglePanel(Panel.Palette);
  const element = await mount<PcColourPalette>("pc-colour-palette", { app });
  const toasts = events<{ message: string; kind: string }>(element, "pc-toast");
  return { app, element, toasts };
};

/** The element's input, slider or button matching a selector */
const get = <T extends HTMLElement = HTMLElement>(
  element: PcColourPalette,
  selector: string,
) => query<T>(element, selector);

/** Set an input's value and fire an event, then wait for the element to update */
const enter = async (
  element: PcColourPalette,
  input: HTMLInputElement,
  value: string,
  type = "input",
) => {
  input.value = value;
  input.dispatchEvent(new Event(type));
  await element.updateComplete;
};

/** The saved colours' buttons */
const swatches = (element: PcColourPalette) =>
  queryAll<HTMLButtonElement>(element, ".swatch");

/** Press a key on an element inside the palette */
const press = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe("channelGradient", () => {
  it("should go from black to pure red, green or blue", () => {
    const hsl = { h: 200, s: 50, l: 30 };
    expect(channelGradient("r", hsl)).toBe(
      "linear-gradient(to right, #000000, #ff0000)",
    );
    expect(channelGradient("g", hsl)).toBe(
      "linear-gradient(to right, #000000, #00ff00)",
    );
    expect(channelGradient("b", hsl)).toBe(
      "linear-gradient(to right, #000000, #0000ff)",
    );
  });

  it("should go through every hue, from red back to red", () => {
    expect(channelGradient("h", { h: 0, s: 0, l: 0 })).toBe(
      "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
    );
  });

  it("should go from grey to full colour, and from black through the colour to white, keeping the other HSL values", () => {
    const hsl = { h: 120, s: 40, l: 50 };
    expect(channelGradient("s", hsl)).toBe(
      "linear-gradient(to right, #808080, #00ff00)",
    );
    expect(channelGradient("l", hsl)).toBe(
      "linear-gradient(to right, #000000, #4db34d, #ffffff)",
    );
  });
});

describe("pc-colour-palette", () => {
  it("should render nothing without an app", async () => {
    const element = await mount<PcColourPalette>("pc-colour-palette");
    expect(element.shadowRoot!.querySelector(".palette")).toBeNull();
    await element.importFile(new File(["{}"], "x.json"));
    await element.exportFile();
  });

  it("should show the selected colour's hex value and RGB values, following the selected colour", async () => {
    const { app, element } = await setup();
    const hex = get<HTMLInputElement>(element, ".hex");
    expect(hex.value).toBe("#000000");
    app.setColour("#ff8000", "background");
    app.selectColour("background");
    await element.updateComplete;
    expect(hex.value).toBe("#FF8000");
    expect(
      queryAll<HTMLInputElement>(element, "input[type=range]").map(
        (input) => input.value,
      ),
    ).toEqual(["255", "128", "0"]);
    expect(
      queryAll<HTMLInputElement>(element, "input[type=number]").map((input) =>
        input.getAttribute("aria-label"),
      ),
    ).toEqual(["Red", "Green", "Blue"]);
  });

  it("should set the colour from a typed 6-digit hex value as it's typed, and a 3-digit one when done", async () => {
    const { app, element } = await setup();
    const hex = get<HTMLInputElement>(element, ".hex");
    await enter(element, hex, "#12");
    expect(hex.getAttribute("aria-invalid")).toBe("true");
    expect(app.colour).toBe("#000000");
    await enter(element, hex, "#123456");
    expect(app.colour).toBe("#123456");
    expect(hex.getAttribute("aria-invalid")).toBe("false");
    await enter(element, hex, "abc");
    // A valid 3-digit value isn't marked invalid, but waits until done
    expect(hex.getAttribute("aria-invalid")).toBe("false");
    expect(app.colour).toBe("#123456");
    await enter(element, hex, "abc", "change");
    expect(app.colour).toBe("#aabbcc");
    expect(hex.value).toBe("#AABBCC");
  });

  it("should show the colour again when a typed value isn't a colour", async () => {
    const { app, element } = await setup();
    const hex = get<HTMLInputElement>(element, ".hex");
    await enter(element, hex, "nope");
    await enter(element, hex, "nope", "change");
    expect(app.colour).toBe("#000000");
    expect(hex.value).toBe("#000000");
  });

  it("should show each slider's colours on its track, following the colour", async () => {
    const { app, element } = await setup();
    const track = (key: string) =>
      get(
        element,
        `input[type=range][data-channel="${key}"]`,
      ).style.getPropertyValue("--track");
    expect(track("r")).toBe("linear-gradient(to right, #000000, #ff0000)");
    get(element, '[role="tab"][data-model="hsl"]').click();
    app.setColour("#00ff00");
    await element.updateComplete;
    expect(track("s")).toBe("linear-gradient(to right, #808080, #00ff00)");
    expect(track("l")).toBe(
      "linear-gradient(to right, #000000, #00ff00, #ffffff)",
    );
  });

  it("should change the colour with the RGB sliders and number fields", async () => {
    const { app, element } = await setup();
    await enter(
      element,
      get<HTMLInputElement>(element, 'input[type=range][data-channel="r"]'),
      "255",
    );
    expect(app.colour).toBe("#ff0000");
    const blue = get<HTMLInputElement>(
      element,
      'input[type=number][data-channel="b"]',
    );
    await enter(element, blue, "300", "change");
    expect(app.colour).toBe("#ff00ff");
    // An empty number field changes nothing
    await enter(element, blue, "", "change");
    expect(app.colour).toBe("#ff00ff");
  });

  it("should switch to HSL, keeping the hue for greys while it's changed", async () => {
    const { app, element } = await setup();
    get(element, '[role="tab"][data-model="hsl"]').click();
    await element.updateComplete;
    expect(element.model).toBe("hsl");
    expect(
      get(element, '[role="tab"][data-model="hsl"]').getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    expect(
      get(element, '[role="tabpanel"]').getAttribute("aria-labelledby"),
    ).toBe("tab-hsl");
    const hue = get<HTMLInputElement>(
      element,
      'input[type=range][data-channel="h"]',
    );
    await enter(element, hue, "200");
    // Black stays black, but the hue shown stays at 200
    expect(app.colour).toBe("#000000");
    expect(hue.value).toBe("200");
    await enter(
      element,
      get<HTMLInputElement>(element, 'input[type=range][data-channel="l"]'),
      "50",
    );
    await enter(
      element,
      get<HTMLInputElement>(element, 'input[type=range][data-channel="s"]'),
      "100",
    );
    expect(app.colour).toBe("#00aaff");
    // Another colour shows its own HSL
    app.setColour("#ff0000");
    await element.updateComplete;
    expect(hue.value).toBe("0");
  });

  it("should move between colour model tabs with the arrow keys, Home and End", async () => {
    const { element } = await setup();
    const tabs = get(element, '[role="tablist"]');
    press(tabs, "ArrowRight");
    await element.updateComplete;
    expect(element.model).toBe("hsl");
    expect(element.shadowRoot!.activeElement).toBe(
      get(element, '[data-model="hsl"]'),
    );
    press(tabs, "ArrowRight");
    await element.updateComplete;
    expect(element.model).toBe("rgb");
    press(tabs, "ArrowLeft");
    await element.updateComplete;
    expect(element.model).toBe("hsl");
    press(tabs, "Home");
    await element.updateComplete;
    expect(element.model).toBe("rgb");
    press(tabs, "End");
    await element.updateComplete;
    expect(element.model).toBe("hsl");
    expect(press(tabs, "a").defaultPrevented).toBe(false);
  });

  it("should select a pressed colour and open the browser's colour picker", async () => {
    const { app, element } = await setup();
    const pair = get<PcColourPair>(element, "pc-colour-pair");
    const openPicker = vi
      .spyOn(pair, "openPicker")
      .mockImplementation(() => undefined);
    await pair.updateComplete;
    query<HTMLButtonElement>(pair, "button.background").click();
    expect(app.selectedColour).toBe("background");
    expect(openPicker).toHaveBeenCalledOnce();
  });

  it("should set the selected colour from a saved colour, marking it", async () => {
    const { app, element } = await setup();
    app.selectColour("background");
    swatches(element)[1]!.click();
    await element.updateComplete;
    expect(app.colours.background).toBe("#00ff00");
    expect(
      swatches(element).map((swatch) => [
        swatch.getAttribute("aria-label"),
        swatch.getAttribute("aria-pressed"),
        swatch.tabIndex,
      ]),
    ).toEqual([
      ["#ff0000", "false", -1],
      ["#00ff00", "true", 0],
      ["#0000ff", "false", -1],
    ]);
  });

  it("should save the selected colour once with [+]", async () => {
    const { app, element } = await setup();
    const add = get<HTMLButtonElement>(element, ".add");
    expect(add.getAttribute("aria-label")).toBe("Save #000000 to the palette");
    add.click();
    await element.updateComplete;
    expect(app.palette.colours.at(-1)).toBe("#000000");
    expect(add.disabled).toBe(true);
  });

  it("should ask before deleting a colour clicked with Alt held, and delete it when confirmed", async () => {
    const { app, element } = await setup();
    swatches(element)[0]!.dispatchEvent(
      new MouseEvent("click", { altKey: true, bubbles: true }),
    );
    await element.updateComplete;
    const dialog = get<PcDialog>(element, "pc-dialog");
    expect([dialog.heading, dialog.message]).toEqual([
      "Delete color",
      "Do you want to delete this color?",
    ]);
    expect(dialog.choices.map((choice) => choice.label)).toEqual([
      "Yes, delete color",
      "Dismiss",
    ]);
    dialog.choose("delete");
    await element.updateComplete;
    expect(app.palette.colours).toEqual(["#00ff00", "#0000ff"]);
    expect(element.shadowRoot!.querySelector("pc-dialog")).toBeNull();
    expect(app.colour).toBe("#000000");
  });

  it("should keep the colour when dismissed", async () => {
    const { app, element } = await setup();
    press(swatches(element)[2]!, "Delete");
    await element.updateComplete;
    get<PcDialog>(element, "pc-dialog").choose("cancel");
    await element.updateComplete;
    expect(app.palette.colours).toHaveLength(3);
    expect(element.shadowRoot!.activeElement).toBe(swatches(element)[2]);
  });

  it("should open a saved colour's menu on right-click, which asks before deleting it", async () => {
    const { app, element } = await setup();
    const event = new MouseEvent("contextmenu", {
      clientX: 30,
      clientY: 40,
      bubbles: true,
      cancelable: true,
    });
    swatches(element)[1]!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await element.updateComplete;
    const menu = get<PcContextMenu>(element, "pc-context-menu");
    expect([menu.x, menu.y, menu.label]).toEqual([30, 40, "#00ff00 actions"]);
    expect(menu.items).toEqual([
      { value: "delete", label: "Delete color", danger: true },
    ]);
    query<HTMLButtonElement>(menu, '[data-value="delete"]').click();
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector("pc-context-menu")).toBeNull();
    get<PcDialog>(element, "pc-dialog").choose("delete");
    await element.updateComplete;
    expect(app.palette.colours).toEqual(["#ff0000", "#0000ff"]);
  });

  it("should return focus to the colour when its menu closes without choosing", async () => {
    const { element } = await setup();
    swatches(element)[2]!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true }),
    );
    await element.updateComplete;
    get<PcContextMenu>(element, "pc-context-menu").close();
    await element.updateComplete;
    await element.updateComplete;
    expect(element.shadowRoot!.activeElement).toBe(swatches(element)[2]);
  });

  it("should open a saved colour's menu on a long press on a touch screen, ignoring the click after it", async () => {
    vi.useFakeTimers();
    const { app, element } = await setup();
    const swatch = swatches(element)[0]!;
    const pointer = (type: string, x: number, pointerType = "touch") =>
      swatch.dispatchEvent(
        Object.assign(new MouseEvent(type, { clientX: x, clientY: 5 }), {
          pointerType,
        }),
      );
    // A mouse press, or a touch that moves away, doesn't open it
    pointer("pointerdown", 5, "mouse");
    vi.advanceTimersByTime(LONG_PRESS_MS);
    pointer("pointerdown", 5);
    pointer("pointermove", 8);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    pointer("pointermove", 30);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    // A touch let go early doesn't either
    pointer("pointerdown", 5);
    pointer("pointerup", 5);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector("pc-context-menu")).toBeNull();
    pointer("pointerdown", 5);
    // Pressing again restarts the wait
    pointer("pointerdown", 6);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    await element.updateComplete;
    expect(get<PcContextMenu>(element, "pc-context-menu").x).toBe(6);
    swatch.click();
    expect(app.colour).toBe("#000000");
    // The next click works again
    swatch.click();
    expect(app.colour).toBe("#ff0000");
    // A press still waiting is forgotten when the palette closes
    pointer("pointerdown", 5);
    element.remove();
    vi.advanceTimersByTime(LONG_PRESS_MS);
  });

  it("should move between saved colours with the arrow keys, Home and End, keeping those keys from the shortcuts", async () => {
    const { element } = await setup();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    const focused = () => element.shadowRoot!.activeElement;
    swatches(element)[0]!.focus();
    press(swatches(element)[0]!, "ArrowRight");
    await element.updateComplete;
    expect(focused()).toBe(swatches(element)[1]);
    press(swatches(element)[1]!, "End");
    await element.updateComplete;
    expect(focused()).toBe(swatches(element)[2]);
    // No further than the ends; one column in a page without layout
    expect(press(swatches(element)[2]!, "ArrowRight").defaultPrevented).toBe(
      false,
    );
    press(swatches(element)[2]!, "ArrowUp");
    await element.updateComplete;
    expect(focused()).toBe(swatches(element)[1]);
    press(swatches(element)[1]!, "Home");
    await element.updateComplete;
    expect(focused()).toBe(swatches(element)[0]);
    press(swatches(element)[0]!, "ArrowUp");
    press(swatches(element)[0]!, "ArrowLeft");
    await element.updateComplete;
    expect(focused()).toBe(swatches(element)[0]);
    expect(swatches(element)[0]!.tabIndex).toBe(0);
    // Moves reached the shortcuts only when they went nowhere (beyond the ends), like keys not used here
    expect(shortcut).toHaveBeenCalledTimes(3);
    press(swatches(element)[0]!, "x");
    expect(shortcut).toHaveBeenCalledTimes(4);
    window.removeEventListener("keydown", shortcut);
  });

  it("should count columns from the grid's width", async () => {
    const { element } = await setup();
    const grid = get(element, ".swatches");
    Object.defineProperty(grid, "clientWidth", { value: 120 });
    for (const swatch of swatches(element))
      Object.defineProperty(swatch, "offsetWidth", { value: 40 });
    press(swatches(element)[2]!, "ArrowUp");
    expect(press(swatches(element)[0]!, "ArrowDown").defaultPrevented).toBe(
      false,
    );
  });

  it("should open a saved colour's menu with the context menu key or Shift+F10, and ask to delete with Delete or Backspace", async () => {
    const { element } = await setup();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    press(swatches(element)[0]!, "ContextMenu");
    await element.updateComplete;
    expect(get<PcContextMenu>(element, "pc-context-menu").open).toBe(true);
    get<PcContextMenu>(element, "pc-context-menu").close();
    await element.updateComplete;
    press(swatches(element)[0]!, "F10", { shiftKey: true });
    await element.updateComplete;
    get<PcContextMenu>(element, "pc-context-menu").close();
    press(swatches(element)[1]!, "Backspace");
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector("pc-dialog")).not.toBeNull();
    expect(shortcut).not.toHaveBeenCalled();
    window.removeEventListener("keydown", shortcut);
  });

  it("should focus the next colour after deleting one, and nothing when none are left", async () => {
    const { app, element } = await setup(["#ff0000", "#00ff00"]);
    press(swatches(element)[1]!, "Delete");
    await element.updateComplete;
    get<PcDialog>(element, "pc-dialog").choose("delete");
    await element.updateComplete;
    await element.updateComplete;
    expect(element.shadowRoot!.activeElement).toBe(swatches(element)[0]);
    press(swatches(element)[0]!, "Delete");
    await element.updateComplete;
    get<PcDialog>(element, "pc-dialog").choose("delete");
    await element.updateComplete;
    expect(app.palette.colours).toEqual([]);
  });

  it("should show the delete cursor while Alt is held", async () => {
    const { element } = await setup();
    expect(element.style.getPropertyValue("--pc-delete-cursor")).toContain(
      "not-allowed",
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    expect(element.hasAttribute("deleting")).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
    expect(element.hasAttribute("deleting")).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    window.dispatchEvent(new Event("blur"));
    expect(element.hasAttribute("deleting")).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    expect(element.hasAttribute("deleting")).toBe(false);
  });

  it("should close with Escape, but not while asking or a menu is open", async () => {
    const { app, element } = await setup();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    const palette = get(element, ".palette");
    press(swatches(element)[0]!, "Delete");
    await element.updateComplete;
    press(palette, "Escape");
    expect(app.panel).toBe(Panel.Palette);
    get<PcDialog>(element, "pc-dialog").choose("cancel");
    await element.updateComplete;
    swatches(element)[0]!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true }),
    );
    await element.updateComplete;
    press(palette, "Escape");
    expect(app.panel).toBe(Panel.Palette);
    get<PcContextMenu>(element, "pc-context-menu").close();
    await element.updateComplete;
    press(palette, "Enter");
    expect(app.panel).toBe(Panel.Palette);
    shortcut.mockClear();
    const escape = press(palette, "Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(app.panel).toBeNull();
    // The Escape that closes the palette doesn't reach the shortcuts
    expect(shortcut).not.toHaveBeenCalled();
    window.removeEventListener("keydown", shortcut);
  });

  it("should import a palette file, adding its new colours", async () => {
    const { app, element, toasts } = await setup();
    await element.importFile(
      new File(
        [exportPaletteFile(["#ff0000", "#123456", "#abcdef"])],
        "palette.json",
      ),
    );
    expect(app.palette.colours).toEqual([
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#123456",
      "#abcdef",
    ]);
    expect(toasts).toEqual([{ message: "Added 2 colors", kind: "success" }]);
  });

  it("should import the implementer's own palette file format", async () => {
    const { app, element, toasts } = await setup([]);
    Object.assign(app.names, { paletteFileFormat: "myapp-palette" });
    await element.importFile(
      new File([exportPaletteFile(["#123456"], "myapp-palette")], "p.json"),
    );
    await element.importFile(
      new File([exportPaletteFile(["#654321"], PALETTE_FILE_FORMAT)], "p.json"),
    );
    expect(app.palette.colours).toEqual(["#123456", "#654321"]);
    expect(toasts.map((toast) => toast.message)).toEqual([
      "Added 1 color",
      "Added 1 color",
    ]);
  });

  it("should show an error for files that can't be read or aren't palette files", async () => {
    const { app, element, toasts } = await setup();
    await element.importFile(new File(["{"], "bad.json"));
    const unreadable = new File(["x"], "x.json");
    vi.spyOn(unreadable, "text").mockRejectedValue(new Error("No"));
    await element.importFile(unreadable);
    vi.spyOn(app.palette, "merge").mockImplementation(() => {
      throw new Error("Unexpected");
    });
    await element.importFile(new File([exportPaletteFile([])], "p.json"));
    expect(toasts).toEqual([
      { message: "Color palette JSON file not compatible", kind: "error" },
      { message: "Failed to read color palette JSON file", kind: "error" },
      { message: "Failed to read color palette JSON file", kind: "error" },
    ]);
  });

  it("should import a file chosen with the Import button", async () => {
    const { element } = await setup();
    const input = get<HTMLInputElement>(element, ".import-file");
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);
    get(element, "button.import").click();
    expect(click).toHaveBeenCalledOnce();
    const importFile = vi
      .spyOn(element, "importFile")
      .mockResolvedValue(undefined);
    const file = new File([exportPaletteFile([])], "p.json");
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    input.dispatchEvent(new Event("change"));
    expect(importFile).toHaveBeenCalledWith(file);
    Object.defineProperty(input, "files", { value: [], configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(importFile).toHaveBeenCalledOnce();
  });

  it("should save to a JSON file by default", async () => {
    const { element } = await setup();
    const picker = vi.fn(async () => ({
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    }));
    Object.assign(window, { showSaveFilePicker: picker });
    expect(await element.saveFile(new Blob(["{}"]), "p.json")).toBe("picker");
    expect(picker).toHaveBeenCalledWith({
      suggestedName: "p.json",
      types: [
        { description: "JSON file", accept: { "application/json": [".json"] } },
      ],
    });
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });

  it("should export the saved colours as a palette file, showing an error when it fails", async () => {
    const { app, element, toasts } = await setup();
    const saved: { blob: Blob; name: string }[] = [];
    element.saveFile = vi.fn(async (blob: Blob, name: string) => {
      saved.push({ blob, name });
      return "download" as const;
    });
    get(element, "button.export").click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toMatch(/^paintcanvas-palette-.*\.json$/);
    expect(JSON.parse(await saved[0]!.blob.text()).colours).toEqual(
      app.palette.colours,
    );
    vi.mocked(element.saveFile).mockRejectedValueOnce(new Error("denied"));
    await element.exportFile();
    expect(toasts).toEqual([
      { message: "Error exporting color palette JSON file", kind: "error" },
    ]);
  });
});
