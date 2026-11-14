import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import {
  hasToolSettings,
  sliderToZoom,
  ZOOM_SLIDER_STEPS,
  zoomPercent,
  zoomToSlider,
  type PcToolSettings,
} from "..";
import type { PcBrushSize } from "../../PcBrushSize";
import type { PcNumberSlider } from "../../PcNumberSlider";
import type { PcPopover } from "../../PcPopover";
import { icons } from "../../../icons";
import { MAX_ZOOM, MIN_ZOOM } from "../../../../lib/classes/Viewport";
import { Panel, Tool } from "../../../../lib/classes/PaintCanvas";
import type { TransformBox } from "../../../../lib/transform/geometry";
import type { PcToggleCheckbox } from "../../PcToggleCheckbox";
import { mount, query, queryAll, shadow } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

/** Create a pointer-like event (jsdom has no PointerEvent) */
const pointer = (type: string, clientX: number, clientY: number) =>
  new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true });

/** A brush setting's number slider in the bar, e.g. "width" */
const slider = (element: PcToolSettings, name: string) =>
  query<PcNumberSlider>(element, `pc-number-slider.${name}`);

/** A number slider's control, pressed and dragged */
const control = (numberSlider: PcNumberSlider) =>
  query(numberSlider, "[role=slider]");

/** Type a value into a number slider and press Enter */
const typeInto = async (numberSlider: PcNumberSlider, value: string) => {
  numberSlider.startEditing();
  const field = query<HTMLInputElement>(numberSlider, "input");
  field.value = value;
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
  );
  await numberSlider.updateComplete;
};

/** Show the bar for a tool */
const setup = async (tool: Tool = Tool.Brush) => {
  const app = createApp();
  app.selectTool(tool);
  const element = await mount<PcToolSettings>("pc-tool-settings", { app });
  const events: [string, unknown][] = [];
  for (const type of ["pc-toast", "pc-configure-brush"])
    element.addEventListener(type, (e) =>
      events.push([type, (e as CustomEvent).detail]),
    );
  return { app, element, events };
};

/** Give the move and rotate tools a box to change, as if pixels were found */
const withBox = (
  app: ReturnType<typeof createApp>,
  box: TransformBox = { cx: 50, cy: 50, width: 100, height: 50, rotation: 0 },
) => {
  const transform = app.transform;
  transform.source = { x: 0, y: 0, width: 100, height: 50 };
  transform.box = box;
  const setBox = vi
    .spyOn(transform, "setBox")
    .mockImplementation((next: TransformBox) => {
      transform.box = next;
      transform.dispatchEvent(new Event("change"));
    });
  transform.dispatchEvent(new Event("change"));
  return setBox;
};

describe("hasToolSettings", () => {
  it("should be true for tools with settings", () => {
    expect(
      [Tool.Brush, Tool.Eraser, Tool.Move, Tool.CircleLasso, Tool.Zoom].map(
        hasToolSettings,
      ),
    ).toEqual([true, true, true, true, true]);
    expect(hasToolSettings(Tool.Pan)).toBe(false);
  });
});

describe("pc-tool-settings", () => {
  it("should show nothing without an app or for tools without settings", async () => {
    const empty = await mount<PcToolSettings>("pc-tool-settings");
    expect(queryAll(empty, "[role=toolbar]")).toHaveLength(0);
    const { element } = await setup(Tool.Pan);
    expect(queryAll(element, "[role=toolbar]")).toHaveLength(0);
  });

  it("should show the brush size control between the preset and the size settings button", async () => {
    const { app, element } = await setup(Tool.Eraser);
    const size = query<PcBrushSize>(element, "pc-brush-size");
    expect(size.settings).toBe(app.eraser);
    expect(size.label).toBe("Eraser size");
    // Named "Size" above it, like the other fields
    const field = size.parentElement!;
    expect(field.classList.contains("field")).toBe(true);
    expect(field.firstElementChild!.textContent).toBe("Size");
    expect(field.previousElementSibling!.classList.contains("preset")).toBe(
      true,
    );
    expect(field.nextElementSibling!.classList.contains("size-settings")).toBe(
      true,
    );
  });

  it("should show and hide width, constrain proportions and height in a popover from the cog button", async () => {
    const { app, element } = await setup();
    const button = query<HTMLButtonElement>(element, "button.size-settings");
    const popover = query<PcPopover>(element, "pc-popover.size-popover");
    expect(button.getAttribute("aria-label")).toBe("Size settings");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.querySelector("img")!.getAttribute("src")).toBe(
      icons.get("cog"),
    );
    expect(popover.open).toBe(false);
    expect(popover.arrow).toBe(true);
    expect(popover.label).toBe("Size settings");
    expect(
      [...popover.querySelectorAll(".size-fields > *")].map((e) =>
        e.matches(".field")
          ? e.querySelector("pc-number-slider")!.className
          : "constrain",
      ),
    ).toEqual(["width", "constrain", "height"]);
    // The pen toggles are on the bar, not in the popover
    expect(popover.querySelector("input.pressure")).toBeNull();

    // Opens under the button, pointing at it
    const place = vi.spyOn(popover, "placeBelow");
    button.click();
    await element.updateComplete;
    await popover.updateComplete;
    await Promise.resolve();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(popover.open).toBe(true);
    expect(popover.anchor).toBe(button);
    expect(place).toHaveBeenCalledTimes(1);
    // Follows the button when the bar scrolls or the window resizes
    query(element, "[role=toolbar]").dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(place).toHaveBeenCalledTimes(3);

    // Closing with focus inside returns focus to the button
    popover.focus();
    popover.dispatchEvent(new CustomEvent("pc-close"));
    await element.updateComplete;
    expect(popover.open).toBe(false);
    expect(element.shadowRoot!.activeElement).toBe(button);
    window.dispatchEvent(new Event("resize"));
    expect(place).toHaveBeenCalledTimes(3);

    // Closing with focus elsewhere leaves it there
    button.click();
    await element.updateComplete;
    const configure = query<HTMLButtonElement>(element, "button.configure");
    configure.focus();
    popover.dispatchEvent(new CustomEvent("pc-close"));
    await element.updateComplete;
    expect(element.shadowRoot!.activeElement).toBe(configure);

    // The button closes it too
    button.click();
    await element.updateComplete;
    button.click();
    await element.updateComplete;
    expect(popover.open).toBe(false);

    // Switching to a tool without size settings hides them
    button.click();
    await element.updateComplete;
    app.selectTool(Tool.Pan);
    await element.updateComplete;
    app.selectTool(Tool.Brush);
    await element.updateComplete;
    expect(query<PcPopover>(element, "pc-popover.size-popover").open).toBe(
      false,
    );
  });

  it("should stop following the window once removed", async () => {
    const { element } = await setup();
    query<HTMLButtonElement>(element, "button.size-settings").click();
    await element.updateComplete;
    const popover = query<PcPopover>(element, "pc-popover.size-popover");
    const place = vi.spyOn(popover, "placeBelow");
    element.remove();
    window.dispatchEvent(new Event("resize"));
    expect(place).not.toHaveBeenCalled();
  });

  it("should change the width and height when pressed and dragged", async () => {
    const { app, element } = await setup();
    app.brush.select("round20");
    await element.updateComplete;
    const width = control(slider(element, "width"));
    const height = control(slider(element, "height"));

    // Right and up wider; the height follows while proportions are constrained
    width.dispatchEvent(pointer("pointerdown", 0, 0));
    width.dispatchEvent(pointer("pointermove", 5, -5));
    expect([app.brush.width, app.brush.height]).toEqual([30, 30]);
    width.dispatchEvent(pointer("pointermove", 0, 0));
    expect([app.brush.width, app.brush.height]).toEqual([20, 20]);
    width.dispatchEvent(pointer("pointerup", 0, 0));

    // Left and down shorter, down to 1 pixel; the width stays without constrained proportions
    app.brush.update({ constrainProportions: false });
    height.dispatchEvent(pointer("pointerdown", 0, 0));
    height.dispatchEvent(pointer("pointermove", -100, 100));
    expect([app.brush.width, app.brush.height]).toEqual([20, 1]);
    height.dispatchEvent(pointer("pointermove", 0, 0));
    expect([app.brush.width, app.brush.height]).toEqual([20, 201]);
    height.dispatchEvent(pointer("pointercancel", 0, 0));
  });

  it("should change the brush's size, proportions and opacity when typed", async () => {
    const { app, element } = await setup();
    app.brush.select("round20");
    await element.updateComplete;
    expect(query(element, "[role=toolbar]").getAttribute("aria-label")).toBe(
      "Brush settings",
    );
    const width = slider(element, "width");
    expect(width.label).toBe("Width");
    await typeInto(width, "30");
    expect([app.brush.width, app.brush.height]).toEqual([30, 30]);
    const constrain = query<HTMLInputElement>(element, "input.constrain");
    expect(constrain.checked).toBe(true);
    constrain.checked = false;
    constrain.dispatchEvent(new Event("change"));
    expect(app.brush.preset.constrainProportions).toBe(false);
    await typeInto(slider(element, "height"), "12");
    expect([app.brush.width, app.brush.height]).toEqual([30, 12]);
    const opacity = slider(element, "opacity");
    expect([opacity.min, opacity.max, opacity.unit]).toEqual([0, 100, "%"]);
    // Already at the most (100%)
    await typeInto(opacity, "150");
    expect(opacity.value).toBe(100);
    expect(app.brush.preset.alpha ?? 1).toBe(1);
    await typeInto(opacity, "40");
    expect(app.brush.preset.alpha).toBe(0.4);
    await element.updateComplete;
    expect(opacity.value).toBe(40);
    // The preset itself is unchanged
    expect(app.brush.selectedPreset?.content.alpha).toBeUndefined();
  });

  it("should show the size a constrained brush got when a typed size is past a limit", async () => {
    const { app, element } = await setup();
    app.brush.update({ constrainProportions: false });
    app.brush.setSize(30, 10);
    app.brush.update({ constrainProportions: true });
    await element.updateComplete;
    const height = slider(element, "height");
    await typeInto(height, "200");
    await element.updateComplete;
    // The width stops at 256 pixels, so the height stops at a third of it
    expect([app.brush.width, app.brush.height]).toEqual([256, 85]);
    expect(height.value).toBe(85);
  });

  it("should turn pen pressure and tilt on and off for every preset, without changing the preset", async () => {
    const { app, element } = await setup();
    const toggle = async (selector: string, checked: boolean) => {
      const box = query<HTMLInputElement>(element, selector);
      box.checked = checked;
      box.dispatchEvent(new Event("change"));
      await element.updateComplete;
      return box;
    };
    const before = app.brush.preset;
    // Pressure is on and tilt off to start with
    expect(query<HTMLInputElement>(element, "input.pressure").checked).toBe(
      true,
    );
    expect(query<HTMLInputElement>(element, "input.tilt").checked).toBe(false);
    const pressure = await toggle("input.pressure", false);
    expect(app.input.data.penPressure).toBe(false);
    expect(pressure.checked).toBe(false);
    await toggle("input.tilt", true);
    expect(app.input.data.penTilt).toBe(true);
    // The brush's settings are unchanged
    expect(app.brush.preset).toBe(before);
    // Another preset keeps them
    app.brush.select("round20");
    await element.updateComplete;
    expect(query<HTMLInputElement>(element, "input.pressure").checked).toBe(
      false,
    );
    expect(query<HTMLInputElement>(element, "input.tilt").checked).toBe(true);
    // Changed elsewhere (e.g. restored settings)
    app.input.update({ penPressure: true });
    await element.updateComplete;
    expect(query<HTMLInputElement>(element, "input.pressure").checked).toBe(
      true,
    );
  });

  it.each([Tool.Brush, Tool.Eraser])(
    "should show pressure, tilt and focus pen mode on the bar after the size settings button, for tool %s",
    async (tool) => {
      const { app, element } = await setup(tool);
      const cog = query(element, ".start > button.size-settings");
      const pressure = cog.nextElementSibling!;
      const tilt = pressure.nextElementSibling!;
      const toggle = tilt.nextElementSibling as HTMLButtonElement;
      expect(pressure.querySelector("input.pressure")).not.toBeNull();
      expect(pressure.getAttribute("title")).toBe("Pressure");
      expect(tilt.querySelector("input.tilt")).not.toBeNull();
      expect(toggle.classList.contains("focus-pen")).toBe(true);
      expect(toggle.getAttribute("aria-label")).toBe("Focus pen mode");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(toggle.querySelector("img")!.getAttribute("src")).toMatch(
        /icon-focus-pen@2x\.png$/,
      );
      toggle.click();
      expect(app.input.data.focusPen).toBe(true);
      await element.updateComplete;
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      toggle.click();
      expect(app.input.data.focusPen).toBe(false);
    },
  );

  it.each([Tool.RectangleLasso, Tool.Move, Tool.Zoom, Tool.ColourSample])(
    "should leave out focus pen mode for tool %s",
    async (tool) => {
      const { element } = await setup(tool);
      expect(element.shadowRoot!.querySelector(".focus-pen")).toBeNull();
    },
  );

  it("should put the tool's settings at the start, with a slot at the start and the end", async () => {
    const { element } = await setup(Tool.RectangleLasso);
    const start = query(element, "[role=toolbar] > .start");
    const end = query(element, "[role=toolbar] > .end");
    expect(start.getAttribute("part")).toBe("start");
    expect(end.getAttribute("part")).toBe("end");
    expect(start.querySelector("button.select-all")).not.toBeNull();
    expect(start.lastElementChild!.getAttribute("name")).toBe("start");
    expect(end.lastElementChild!.getAttribute("name")).toBe("end");
  });

  it("should ask to configure the brush or eraser", async () => {
    const { app, element, events } = await setup(Tool.Eraser);
    expect(query(element, "[role=toolbar]").getAttribute("aria-label")).toBe(
      "Eraser settings",
    );
    query(element, "button.configure").click();
    app.selectTool(Tool.Brush);
    await element.updateComplete;
    query(element, "button.configure").click();
    expect(events).toEqual([
      ["pc-configure-brush", "eraser"],
      ["pc-configure-brush", "brush"],
    ]);
  });

  it("should show the preset's name and shape, and show or hide its preset menu", async () => {
    const { app, element } = await setup();
    app.brush.select("round20");
    await element.updateComplete;
    const button = query<HTMLButtonElement>(element, "button.preset");
    expect(button.textContent?.trim()).toBe(app.brush.name);
    app.closePanel();
    await element.updateComplete;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.click();
    await element.updateComplete;
    expect(app.panel).toBe(Panel.Brush);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    button.click();
    await element.updateComplete;
    expect(app.panel).toBeNull();
    app.brush.apply({
      ...app.brush.preset,
      image: "data:image/png;base64,AAAA",
    });
    await element.updateComplete;
    const preview = query(element, ".shape-preview");
    expect(preview.classList.contains("image")).toBe(true);
    expect(preview.style.maskImage).toBe('url("data:image/png;base64,AAAA")');
    app.brush.apply({ ...app.brush.preset, image: undefined });
    await element.updateComplete;
    expect(preview.classList.contains("image")).toBe(false);
    app.selectTool(Tool.Eraser);
    await element.updateComplete;
    query(element, "button.preset").click();
    expect(app.panel).toBe(Panel.Eraser);
  });

  it("should select all for every lasso, and invert and deselect while there is a mask", async () => {
    const { app, element } = await setup(Tool.RectangleLasso);
    const selectAll = vi.spyOn(app.selection, "selectAll");
    const invert = vi.spyOn(app.selection, "invert");
    const clear = vi.spyOn(app.selection, "clear");
    const button = (name: string) =>
      query<HTMLButtonElement>(element, `button.${name}`);
    const disabled = () =>
      ["select-all", "invert", "deselect"].map((name) => button(name).disabled);
    query(element, "button.select-all").click();
    // Without a mask (these canvases never have one), there's nothing to invert or deselect
    await element.updateComplete;
    expect(disabled()).toEqual([false, true, true]);
    button("invert").click();
    button("deselect").click();
    expect(
      [selectAll, invert, clear].map((spy) => spy.mock.calls.length),
    ).toEqual([1, 0, 0]);
    // With a mask
    app.selection.active = true;
    app.selection.dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(disabled()).toEqual([false, false, false]);
    button("invert").click();
    expect(invert).toHaveBeenCalledOnce();
    button("deselect").click();
    expect(clear).toHaveBeenCalledOnce();
    await element.updateComplete;
    expect(disabled()).toEqual([false, true, true]);
    app.selectTool(Tool.FreeformLasso);
    await element.updateComplete;
    expect(query(element, "[role=toolbar]").getAttribute("aria-label")).toBe(
      "Mask settings",
    );
  });

  it("should leave the move settings off until there is something to move", async () => {
    const { element } = await setup(Tool.Move);
    for (const name of ["width", "height", "angle"]) {
      expect(slider(element, name).disabled).toBe(true);
      expect(slider(element, name).text).toBe("–");
    }
    expect(
      query<HTMLButtonElement>(element, "button.flip-horizontal").disabled,
    ).toBe(true);
    // Clicking disabled buttons programmatically does nothing
    query(element, "button.flip-horizontal").click();
    query(element, "button.flip-vertical").click();
    const setBox = vi.spyOn(element.app!.transform, "setBox");
    slider(element, "width").dispatchEvent(
      new CustomEvent("pc-change", { detail: { value: 10 } }),
    );
    expect(setBox).not.toHaveBeenCalled();
  });

  it("should resize in pixels or percent, constrained or not, flip and reset", async () => {
    const { app, element } = await setup(Tool.Move);
    const setBox = withBox(app);
    await element.updateComplete;
    // "Constrain proportions" is off by default
    expect(app.constrainProportions).toBe(false);
    expect(query<HTMLInputElement>(element, "input.constrain").checked).toBe(
      false,
    );
    app.setConstrainProportions(true);
    await element.updateComplete;
    const width = slider(element, "width");
    expect([width.value, width.unit, width.text]).toEqual([100, "", ""]);
    await typeInto(width, "200");
    expect(app.transform.box).toMatchObject({ width: 200, height: 100 });
    // Not below 1
    await typeInto(width, "0");
    expect(app.transform.box).toMatchObject({ width: 1, height: 0.5 });
    expect(setBox).toHaveBeenCalledTimes(2);
    await typeInto(width, "200");

    const percent = query<PcToggleCheckbox>(element, ".percent");
    expect(percent.size).toBe("s");
    shadow<HTMLInputElement>(percent, "input").click();
    await element.updateComplete;
    expect([width.value, width.unit]).toEqual([200, "%"]);
    await typeInto(slider(element, "height"), "50");
    expect(app.transform.box).toMatchObject({ width: 50, height: 25 });

    const constrain = query<HTMLInputElement>(element, "input.constrain");
    expect(constrain.checked).toBe(true);
    constrain.checked = false;
    constrain.dispatchEvent(new Event("change"));
    // Shared with dragging the box's handles
    expect(app.constrainProportions).toBe(false);
    app.setConstrainProportions(true);
    await element.updateComplete;
    expect(constrain.checked).toBe(true);
    app.setConstrainProportions(false);
    await element.updateComplete;
    expect(constrain.checked).toBe(false);
    await typeInto(width, "100");
    expect(app.transform.box).toMatchObject({ width: 100, height: 25 });

    query(element, "button.flip-horizontal").click();
    query(element, "button.flip-vertical").click();
    expect(app.transform.box).toMatchObject({ width: -100, height: -25 });
    await element.updateComplete;
    // Flipped sides show as positive, and resizing keeps the flips
    expect(width.value).toBe(100);
    await typeInto(width, "50");
    expect(app.transform.box?.width).toBe(-50);

    const cancel = vi.spyOn(app, "cancelTransform");
    query(element, "button.reset").click();
    expect(cancel).toHaveBeenCalled();
  });

  it("should show the move, scale and rotate settings in order", async () => {
    const { element } = await setup(Tool.Move);
    const toolbar = query(element, "[role=toolbar]");
    expect(toolbar.getAttribute("aria-label")).toBe(
      "Move, scale and rotate settings",
    );
    expect(
      [
        ...toolbar.querySelectorAll(
          ".start > :is(.field, label, pc-toggle-checkbox, button)",
        ),
      ].map((item) => item.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual([
      "Width",
      "Constrain proportions",
      "Height",
      "Percent",
      "Flip horizontal",
      "Flip vertical",
      "Angle",
      "Rotate 90° left",
      "Rotate 90° right",
      "Reset",
    ]);
    const angle = slider(element, "angle");
    expect([
      angle.min,
      angle.max,
      angle.step,
      angle.dragStep,
      angle.unit,
    ]).toEqual([-360, 360, 0.01, 1, "°"]);
  });

  it("should show icons on the flip and rotate 90° buttons", async () => {
    const { element } = await setup(Tool.Move);
    for (const [button, icon] of [
      ["flip-horizontal", "flip-horizontal"],
      ["flip-vertical", "flip-vertical"],
      ["rotate-left", "rotate-90-left"],
      ["rotate-right", "rotate-90-right"],
    ]) {
      expect(
        query(element, `button.${button} img`).getAttribute("src"),
        button,
      ).toMatch(new RegExp(`/icon-${icon}@2x\\.png$`));
    }
  });

  it("should make the mask actions and the zoom's Reset small purple pills", async () => {
    const masks = await setup(Tool.RectangleLasso);
    for (const button of ["select-all", "invert", "deselect"])
      expect(query(masks.element, `button.${button}`).classList).toContain(
        "pill-s",
      );
    const zoom = await setup(Tool.Zoom);
    expect(query(zoom.element, "button.reset").classList).toContain("pill-s");
  });

  it("should rotate by an angle (to 2 decimal places) or 90° steps", async () => {
    const { app, element } = await setup(Tool.Move);
    const angle = slider(element, "angle");
    expect(angle.disabled).toBe(true);
    query(element, "button.rotate-right").click();
    query(element, "button.rotate-left").click();
    query(element, "button.reset").click();
    const setBox = vi.spyOn(app.transform, "setBox");
    // A change with nothing to move does nothing
    angle.dispatchEvent(new CustomEvent("pc-change", { detail: { value: 5 } }));
    expect(setBox).not.toHaveBeenCalled();
    setBox.mockRestore();
    withBox(app);
    await element.updateComplete;
    query(element, "button.rotate-right").click();
    expect(app.transform.box?.rotation).toBe(90);
    query(element, "button.rotate-left").click();
    query(element, "button.rotate-left").click();
    expect(app.transform.box?.rotation).toBe(-90);
    await typeInto(angle, "400");
    // At most 360°, which is a whole turn
    expect(app.transform.box?.rotation).toBe(0);
    await typeInto(angle, "40");
    expect(app.transform.box?.rotation).toBe(40);
    await typeInto(angle, "12.3456");
    expect(app.transform.box?.rotation).toBe(12.35);
    app.transform.setBox({ ...app.transform.box!, rotation: 33.33333 });
    await element.updateComplete;
    expect(angle.value).toBe(33.33);
  });
});

describe("zoom slider scale", () => {
  it("should place zoom levels on a logarithmic slider across the zoom range", () => {
    expect(zoomToSlider(MIN_ZOOM)).toBe(0);
    expect(zoomToSlider(MAX_ZOOM)).toBe(ZOOM_SLIDER_STEPS);
    // 6.25% to 3200% is 9 doublings: 100% is 4 of them
    expect(zoomToSlider(1)).toBe(Math.round((4 / 9) * ZOOM_SLIDER_STEPS));
    expect(sliderToZoom(0)).toBe(MIN_ZOOM);
    expect(sliderToZoom(ZOOM_SLIDER_STEPS)).toBeCloseTo(MAX_ZOOM);
    expect(sliderToZoom(zoomToSlider(2))).toBeCloseTo(2, 1);
  });

  it("should show zoom as a percentage, to one decimal place below 10%", () => {
    expect(zoomPercent(1)).toBe("100%");
    expect(zoomPercent(1.5)).toBe("150%");
    expect(zoomPercent(2 / 3)).toBe("67%");
    expect(zoomPercent(0.0625)).toBe("6.3%");
  });
});

describe("pc-tool-settings zoom", () => {
  it("should zoom in and out, by slider and back to 100%, around the centre of the view", async () => {
    const { app, element } = await setup(Tool.Zoom);
    const view = app.viewport;
    view.resize(400, 300);
    view.zoomAt({ x: 0, y: 0 }, 1);
    await element.updateComplete;
    const toolbar = query(element, "[role=toolbar]");
    expect(toolbar.getAttribute("aria-label")).toBe("Zoom settings");
    expect(
      [...toolbar.querySelectorAll("button, label")].map(
        (item) =>
          item.getAttribute("aria-label") ??
          item.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual(["Zoom in", "Zoom out", "Zoom 100%", "Reset"]);
    expect(toolbar.querySelector(".zoom-in img")?.getAttribute("src")).toMatch(
      /icon-zoom-in@2x\.png$/,
    );
    const zoomAt = vi.spyOn(view, "zoomAt");

    query(element, "button.zoom-in").click();
    expect(view.zoom).toBe(1.5);
    expect(zoomAt).toHaveBeenLastCalledWith({ x: 200, y: 150 }, 1.5);
    await element.updateComplete;
    expect(query(element, "output").textContent).toBe("150%");
    query(element, "button.zoom-out").click();
    query(element, "button.zoom-out").click();
    expect(view.zoom).toBeCloseTo(2 / 3);

    const slider = query<HTMLInputElement>(element, "input.zoom");
    expect([slider.min, slider.max, slider.step]).toEqual(["0", "1000", "1"]);
    slider.value = String(ZOOM_SLIDER_STEPS);
    slider.dispatchEvent(new Event("input"));
    expect(view.zoom).toBeCloseTo(MAX_ZOOM);
    await element.updateComplete;
    expect(query<HTMLButtonElement>(element, "button.zoom-in").disabled).toBe(
      true,
    );
    expect(slider.value).toBe(String(ZOOM_SLIDER_STEPS));

    query(element, "button.reset").click();
    expect(view.zoom).toBe(1);
    expect(zoomAt).toHaveBeenLastCalledWith({ x: 200, y: 150 }, 1);
    slider.value = "0";
    slider.dispatchEvent(new Event("input"));
    await element.updateComplete;
    expect(view.zoom).toBe(MIN_ZOOM);
    expect(query<HTMLButtonElement>(element, "button.zoom-out").disabled).toBe(
      true,
    );
  });

  it("should choose point or area sampling for the colour sample tool", async () => {
    const { app, element } = await setup(Tool.ColourSample);
    const point = query(element, "button.sample-point");
    const area = query(element, "button.sample-area");
    expect(point.getAttribute("aria-label")).toBe("Point sample");
    expect([
      point.getAttribute("aria-pressed"),
      area.getAttribute("aria-pressed"),
    ]).toEqual(["true", "false"]);
    area.click();
    await element.updateComplete;
    expect(app.sampleMode).toBe("area");
    expect(area.getAttribute("aria-pressed")).toBe("true");
    point.click();
    expect(app.sampleMode).toBe("point");
  });

  it("should show its text in the chosen language", async () => {
    const app = createApp();
    const element = await mount<PcToolSettings>("pc-tool-settings", { app });
    await element.translations.setLocale("ja");
    await element.updateComplete;
    expect(query(element, "[role=toolbar]").getAttribute("aria-label")).toBe(
      "ブラシの設定",
    );
    expect(query(element, "button.configure").textContent?.trim()).toBe(
      "詳細設定",
    );
    await element.translations.setLocale("en-US");
  });

  it("should show the settings' name, and leave proportions free by default", async () => {
    const app = createApp();
    // Applying settings keeps the name, unless given one
    app.brush.apply({}, "Plain");
    const element = await mount<PcToolSettings>("pc-tool-settings", { app });
    expect(query(element, "button.preset").textContent?.trim()).toBe("Plain");
    expect(query<HTMLInputElement>(element, "input.constrain").checked).toBe(
      false,
    );
  });
});
