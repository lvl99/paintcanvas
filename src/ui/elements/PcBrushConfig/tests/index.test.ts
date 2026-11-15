import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import type { PcDialogWindow } from "../../PcDialogWindow";
import type { PcSliderRange } from "../../PcSliderRange";
import type { PcProfileEditor } from "../../PcProfileEditor";
import { PROFILE_PRESETS, linearPoints } from "../../../../lib/profiles";
import { CANCEL_CHOICE, type PcDialog } from "../../PcDialog";
import { OK_CHOICE } from "../../../ask";
import type { PcBrushConfig } from "..";
import type { PcToggleCheckbox } from "../../PcToggleCheckbox";
import type { PcContextMenu } from "../../PcContextMenu";
import type { PcNumberSlider } from "../../PcNumberSlider";
import { SmoothingType, type BrushConfig } from "../../../../lib/brushes/types";
import {
  SHAPE_ERRORS,
  ShapeImageError,
} from "../../../../lib/brushes/shapeImage";
import {
  mount,
  query,
  queryAll,
  shadow,
  toastText,
} from "../../../../testing/elements";
import { createApp, TEST_HANDLE } from "../../../../testing/app";
import { BUILT_IN_SHAPES } from "../../../../lib/brushes/shapes";

afterEach(() => document.body.replaceChildren());

const shape = { image: "data:image/png;base64,AAAA", width: 40, height: 20 };

/** Show the window for the brush's current settings, recording what it fires */
const setup = async (props: Partial<PcBrushConfig> = {}) => {
  const app = createApp();
  app.brush.select("round20");
  const element = await mount<PcBrushConfig>("pc-brush-config", {
    app,
    kind: "brush",
    config: { ...app.brush.preset, width: 20, height: 20 },
    presetName: app.brush.name,
    ...props,
  });
  element.confirm = vi.fn(() => true);
  element.prompt = vi.fn(() => "My brush");
  element.readShape = vi.fn(async () => shape);
  element.readClipboard = vi.fn(async () => shape);
  const events: [string, unknown][] = [];
  for (const type of ["pc-close", "pc-save", "pc-toast"])
    element.addEventListener(type, (e) =>
      events.push([
        type,
        type === "pc-toast"
          ? toastText((e as CustomEvent).detail)
          : (e as CustomEvent).detail,
      ]),
    );
  return { app, element, events };
};

/** The draft settings */
const draft = (element: PcBrushConfig) => element.draft as BrushConfig;

/** Set an input's value and fire an event */
const enter = async (
  element: PcBrushConfig,
  selector: string,
  value: string,
  type = "change",
) => {
  const input = query<HTMLInputElement>(element, selector);
  input.value = value;
  input.dispatchEvent(new Event(type));
  await element.updateComplete;
};

/** Set a single slider's (or number slider's) value, as dragging it does, and wait for the window to update */
const slide = async (element: PcBrushConfig, name: string, value: number) => {
  const field = query<PcSliderRange | PcNumberSlider>(element, `.${name}`);
  if (field.localName === "pc-number-slider")
    (field as PcNumberSlider).change(value);
  else (field as PcSliderRange).setEnd("high", value, "pc-input");
  await element.updateComplete;
};

/** Click a button and wait for the window to update */
const click = async (element: PcBrushConfig, selector: string) => {
  query(element, selector).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
};

describe("pc-brush-config", () => {
  it("should show nothing without settings", async () => {
    const element = await mount<PcBrushConfig>("pc-brush-config");
    expect(queryAll(element, "pc-dialog-window")).toHaveLength(0);
  });

  it("should edit a copy of the settings in a shaded window, closed with ⨉ or Escape but not a press outside", async () => {
    const { element, events } = await setup();
    const config = element.config as BrushConfig;
    const dialogWindow = query<PcDialogWindow>(element, "pc-dialog-window");
    expect([
      dialogWindow.open,
      dialogWindow.shaded,
      dialogWindow.closable,
      dialogWindow.dismissible,
      dialogWindow.label,
    ]).toEqual([true, true, true, false, "Configure brush"]);
    expect(query(element, "h2.title").slot).toBe("header-middle");
    expect(query(element, "h2.title").textContent?.trim()).toBe(
      "Configure brush",
    );
    expect(query(element, ".settings").slot).toBe("body");
    // The name, then "Add to presets" and Save, at the top
    expect(
      [...query(element, ".settings > .top").children].map(
        (child) => child.className,
      ),
    ).toEqual(["name-field", "actions"]);
    expect(
      queryAll(element, ".top .actions button").map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Add to presets", "Save"]);
    // Snapping beside the test area's controls
    expect(query(element, "pc-brush-test > .snap").slot).toBe("actions");
    expect(query<HTMLInputElement>(element, "input.name").value).toBe(
      "Round 20px",
    );
    // Without changes, it closes straight away; the window stays for the layout to remove
    dialogWindow.requestClose("close");
    dialogWindow.requestClose("escape");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dialogWindow.open).toBe(true);
    expect(events).toEqual([
      ["pc-close", null],
      ["pc-close", null],
    ]);
    await enter(element, "input.name", "Renamed", "input");
    expect(element.draftName).toBe("Renamed");
    expect(element.presetName).toBe("Round 20px");
    expect(config).not.toBe(element.draft);
  });

  it("should mark unsaved changes with an asterisk, and ask whether to save them when closing", async () => {
    const { app, element, events } = await setup();
    const choose = vi.fn<PcBrushConfig["choose"]>(() => CANCEL_CHOICE);
    element.choose = choose;
    expect(element.unsaved).toBe(false);
    expect(queryAll(element, ".unsaved")).toHaveLength(0);
    await slide(element, "spacing", 9);
    const asterisk = query(element, ".name-field .unsaved");
    expect([asterisk.textContent, asterisk.getAttribute("aria-label")]).toEqual(
      ["*", "Unsaved changes"],
    );
    // Cancelled: stays open
    await element.requestClose();
    expect(choose).toHaveBeenLastCalledWith({
      heading: "Save changes?",
      message: "“Round 20px” has unsaved changes.",
      choices: [
        { value: "add", label: "Add to presets…" },
        { value: "discard", label: "Don't save", cancelling: true },
      ],
      cancel: "Cancel",
    });
    expect(events).toEqual([]);
    // Adding to presets cancelled: stays open
    choose.mockReturnValueOnce("add");
    vi.mocked(element.prompt).mockReturnValueOnce(null);
    await element.requestClose();
    expect(events).toEqual([]);
    // Added, then closed
    choose.mockReturnValueOnce("add");
    await element.requestClose();
    expect(app.customPresets.presets[0]?.content.spacing).toBe(9);
    expect(events.at(-1)).toEqual(["pc-close", null]);
    // The user's own preset: saved to it, then closed
    await slide(element, "spacing", 4);
    choose.mockReturnValueOnce("save");
    await element.requestClose();
    expect(choose.mock.lastCall?.[0].choices[0]).toEqual({
      value: "save",
      label: "Save",
    });
    expect(app.customPresets.presets[0]?.content.spacing).toBe(4);
    // Not saved: closed without saving
    await slide(element, "spacing", 2);
    choose.mockReturnValueOnce("discard");
    events.length = 0;
    await element.requestClose();
    expect(app.customPresets.presets[0]?.content.spacing).toBe(4);
    expect(events).toEqual([["pc-close", null]]);
  });
  it("should name the eraser's window", async () => {
    const { element } = await setup({ kind: "eraser" });
    expect(query<PcDialogWindow>(element, "pc-dialog-window").label).toBe(
      "Configure eraser",
    );
  });

  it("should save the changes to the user's own preset being edited, but not to a built-in one", async () => {
    const { app, element, events } = await setup();
    const save = () => query<HTMLButtonElement>(element, "button.save");
    expect(save().disabled).toBe(true);
    expect(save().title).toBe(
      "Built-in presets can't be changed: add to your presets instead",
    );
    await element.save();
    expect(events).toEqual([]);
    const preset = app.newPreset({}, "Mine");
    await app.customPresets.save(preset);
    element.editingId = preset.id;
    await element.updateComplete;
    expect(save().disabled).toBe(false);
    expect(save().hasAttribute("title")).toBe(false);
    await slide(element, "spacing", 9);
    await slide(element, "sample-rate", 100);
    await enter(element, "input.name", "Mine too", "input");
    await click(element, "button.save");
    expect(app.customPresets.get(preset.id)).toMatchObject({
      name: "Mine too",
      content: { spacing: 9, sampleRate: 100 },
    });
    expect(app.brush.presetId).toBe(preset.id);
    expect(events).toEqual([
      [
        "pc-save",
        {
          config: expect.objectContaining({ spacing: 9, sampleRate: 100 }),
          name: "Mine too",
        },
      ],
      ["pc-toast", 'success: Saved "Mine too" to My presets'],
    ]);
    // Saved: no asterisk, and still open
    expect(element.unsaved).toBe(false);
    expect(queryAll(element, ".unsaved")).toHaveLength(0);
  });
  it("should keep the height in proportion while constrained", async () => {
    const { element } = await setup();
    await slide(element, "width", 40);
    expect([draft(element).width, draft(element).height]).toEqual([40, 40]);
    expect(
      query<PcSliderRange>(element, "pc-slider-range.height").disabled,
    ).toBe(true);
    // A switch between the width and height
    const constrain = query<PcToggleCheckbox>(element, ".params > .constrain");
    expect(constrain.textContent?.trim()).toBe("Constrain proportions");
    expect(constrain.previousElementSibling?.getAttribute("data-param")).toBe(
      "width",
    );
    expect(constrain.checked).toBe(true);
    constrain.dispatchEvent(
      new CustomEvent("change", { detail: { checked: false } }),
    );
    await element.updateComplete;
    expect(draft(element).constrainProportions).toBe(false);
    expect(
      query<PcSliderRange>(element, "pc-slider-range.height").disabled,
    ).toBe(false);
    await slide(element, "width", 10);
    await slide(element, "height", 30);
    expect([draft(element).width, draft(element).height]).toEqual([10, 30]);
  });

  it("should vary settings with pressure, tilt and randomness at once, each with its own range under the setting's", async () => {
    const { element } = await setup();
    await click(element, "input.width.pressure");
    expect(draft(element).widthConfig).toMatchObject({
      usePressure: true,
      min: 0.5,
      minPressure: 0,
      maxPressure: 1,
    });
    // The height follows the width's variation while constrained
    expect(draft(element).heightConfig).toEqual(draft(element).widthConfig);
    // The setting's range: changed while dragging and once let go, the highest being the width
    const range = () =>
      query<PcSliderRange>(element, "pc-slider-range.width.range");
    expect([range().label, range().min, range().max]).toEqual([
      "Width",
      1,
      256,
    ]);
    expect([range().low, range().high]).toEqual([10, 20]);
    range().setEnd("low", 6, "pc-input");
    range().setEnd("high", 30);
    await element.updateComplete;
    expect(draft(element).width).toBe(30);
    expect(draft(element).widthConfig?.min).toBeCloseTo(6 / 30);
    // A row for each source turned on, with its range (0–100)
    const rows = () =>
      queryAll(element, '[data-param="width"] .param-row.source').map(
        (row) => row.dataset.source,
      );
    expect(rows()).toEqual(["pressure"]);
    const pressure = () =>
      query<PcSliderRange>(element, "pc-slider-range.width.pressure");
    expect([
      pressure().label,
      pressure().min,
      pressure().max,
      pressure().low,
      pressure().high,
    ]).toEqual(["Width: Pen pressure", 0, 100, 0, 100]);
    expect(
      query(element, '[data-source="pressure"] .label').textContent?.trim(),
    ).toBe("Pen pressure");
    pressure().setEnd("low", 20);
    await element.updateComplete;
    expect(draft(element).widthConfig?.minPressure).toBe(0.2);
    // Tilt as well: both on, the setting's range kept
    await click(element, "input.width.tilt");
    expect(draft(element).widthConfig).toMatchObject({
      usePressure: true,
      useTilt: true,
      minPressure: 0.2,
      minTilt: 0,
    });
    expect(rows()).toEqual(["pressure", "tilt"]);
    expect(range().low).toBe(6);
    // Off again: back to a single value once none is on
    await click(element, "input.width.pressure");
    await click(element, "input.width.tilt");
    expect(draft(element).widthConfig).toMatchObject({
      usePressure: false,
      useTilt: false,
    });
    expect(rows()).toEqual([]);
    expect(query<PcSliderRange>(element, "pc-slider-range.width").single).toBe(
      true,
    );
  });
  it("should show pressure, tilt and randomise as a group of icon checkboxes on each setting that varies", async () => {
    const { element } = await setup();
    const group = query<HTMLFieldSetElement>(
      element,
      '[data-param="width"] fieldset.sources',
    );
    expect(group.querySelector("legend")?.textContent?.trim()).toBe(
      "Width: vary with",
    );
    expect(
      [...group.querySelectorAll("input")].map((input) => input.type),
    ).toEqual(["checkbox", "checkbox", "checkbox"]);
    const toggles = queryAll<HTMLLabelElement>(
      element,
      '[data-param="width"] label.icon-toggle',
    );
    expect(
      toggles.map((toggle) => [
        toggle.title,
        toggle.querySelector("img")?.getAttribute("src")?.split("/").pop(),
        toggle.querySelector("input")?.getAttribute("aria-label"),
      ]),
    ).toEqual([
      ["Pressure", "icon-pressure@2x.png", "Width: Pressure"],
      ["Tilt", "icon-tilt@2x.png", "Width: Tilt"],
      ["Randomize", "icon-randomise@2x.png", "Width: Randomize"],
    ]);
  });

  it("should choose whether the rotation follows the pen's lean, showing tilt rotation from before ranges as following it", async () => {
    const { element } = await setup({
      config: { rotationConfig: { useTilt: true } },
    });
    const lean = query<PcToggleCheckbox>(element, ".follow-lean");
    expect(lean.textContent?.trim()).toBe("Follows the pen's lean");
    expect(lean.checked).toBe(true);
    expect(
      query<HTMLInputElement>(element, "input.rotation.tilt").checked,
    ).toBe(false);
    lean.dispatchEvent(
      new CustomEvent("change", { detail: { checked: false } }),
    );
    await element.updateComplete;
    expect(draft(element)).toMatchObject({
      rotationFollowsLean: false,
      rotationConfig: { useTilt: false },
    });
    lean.dispatchEvent(
      new CustomEvent("change", { detail: { checked: true } }),
    );
    await element.updateComplete;
    expect(draft(element).rotationFollowsLean).toBe(true);
  });
  it("should edit each source's own profile graph, storing it unless it's a straight line", async () => {
    const { app, element } = await setup();
    await click(element, "input.width.pressure");
    const button = () =>
      query<HTMLButtonElement>(element, "button.profile.width.pressure");
    expect(button().title).toBe("Width (Pen pressure): profile graph");
    await click(element, "button.profile.width.pressure");
    const editor = () => query<PcProfileEditor>(element, "pc-profile-editor");
    expect([editor().label, editor().profileId, editor().profiles]).toEqual([
      "Width: Pen pressure",
      "linear",
      app.profiles,
    ]);
    const overweight = PROFILE_PRESETS[1]!.content.points;
    editor().dispatchEvent(
      new CustomEvent("pc-save", {
        detail: { points: overweight, profileId: "overweight" },
      }),
    );
    await element.updateComplete;
    expect(queryAll(element, "pc-profile-editor")).toHaveLength(0);
    expect(draft(element).widthConfig).toMatchObject({
      usePressure: true,
      pressureProfile: overweight,
      pressureProfileId: "overweight",
    });
    // The height follows while constrained
    expect(draft(element).heightConfig?.pressureProfileId).toBe("overweight");
    // Its button is purple while it has a profile graph
    expect(button().classList).toContain("configured");

    // Opened again: its graph; a straight line isn't stored
    await click(element, "button.profile.width.pressure");
    expect([editor().points, editor().profileId]).toEqual([
      overweight,
      "overweight",
    ]);
    editor().dispatchEvent(
      new CustomEvent("pc-save", {
        detail: { points: linearPoints(), profileId: "linear" },
      }),
    );
    await element.updateComplete;
    expect(draft(element).widthConfig?.pressureProfile).toBeUndefined();
    expect(button().classList).not.toContain("configured");

    // A graph shared by the sources (before they had their own), without an ID; closing changes nothing
    element.draft = {
      ...draft(element),
      alphaConfig: { useTilt: true, profile: overweight },
    };
    await element.updateComplete;
    await click(element, "button.profile.alpha.tilt");
    expect([editor().points, editor().profileId]).toEqual([
      overweight,
      undefined,
    ]);
    editor().dispatchEvent(new CustomEvent("pc-close"));
    await element.updateComplete;
    expect(queryAll(element, "pc-profile-editor")).toHaveLength(0);
    expect(draft(element).alphaConfig?.profile).toEqual(overweight);
  });
  it("should keep profile graphs of its own without a canvas", async () => {
    const element = await mount<PcBrushConfig>("pc-brush-config", {
      config: { heightConfig: { useRandomise: true } },
    });
    await click(element, "button.profile.height.randomise");
    expect(
      query<PcProfileEditor>(element, "pc-profile-editor").profiles.graphs,
    ).toEqual([]);
  });

  it("should set a fixed offset in pixels, or a range of them while it varies", async () => {
    const { element } = await setup();
    const single = () =>
      query<PcSliderRange>(element, "pc-slider-range.offsetX");
    expect([single().disabled, single().min, single().max]).toEqual([
      false,
      -100,
      100,
    ]);
    await slide(element, "offsetX", 12);
    expect(draft(element).offsetX).toBe(12);
    await click(element, "input.offsetX.randomise");
    // From the offset, 10 pixels either way
    const range = query<PcSliderRange>(
      element,
      "pc-slider-range.offsetX.range",
    );
    expect([range.min, range.max, range.low, range.high]).toEqual([
      -100, 100, 2, 22,
    ]);
    range.setEnd("high", 60);
    await element.updateComplete;
    expect(draft(element)).toMatchObject({
      offsetX: 2,
      offsetXConfig: { useRandomise: true, min: 0, max: 58 },
    });
    await click(element, "input.rotation.randomise");
    await click(element, "input.alpha.tilt");
    expect(draft(element).rotationConfig?.useRandomise).toBe(true);
    expect(draft(element).alphaConfig?.useTilt).toBe(true);
  });
  it("should show each smoothing as an icon, named on hover", async () => {
    const { element } = await setup();
    expect(
      queryAll<HTMLLabelElement>(element, ".smoothing label").map((label) => [
        label.title,
        label.querySelector("img")?.getAttribute("src")?.split("/").pop(),
      ]),
    ).toEqual([
      ["Linear", "icon-smoothing-linear@2x.png"],
      ["Quadratic curve", "icon-smoothing-bezier-quad@2x.png"],
      ["Cubic curve", "icon-smoothing-bezier-cubic@2x.png"],
    ]);
  });

  it("should choose smoothing, showing old presets' None as Linear", async () => {
    const { element } = await setup({
      config: { smoothingType: SmoothingType.None },
    });
    const radios = queryAll<HTMLInputElement>(element, "input[name=smoothing]");
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);
    radios[2]!.dispatchEvent(new Event("change"));
    expect(draft(element).smoothingType).toBe(SmoothingType.BezierCubic);
    element.config = { smoothingType: SmoothingType.BezierQuad };
    await element.updateComplete;
    expect(
      queryAll<HTMLInputElement>(element, "input[name=smoothing]").map(
        (radio) => radio.checked,
      ),
    ).toEqual([false, true, false]);
  });

  it("should upload or paste a shape, keeping its proportions, or say why it can't be used", async () => {
    const { element, events } = await setup();
    const input = query<HTMLInputElement>(element, "input.shape");
    // "Upload" opens the hidden file field
    const pick = vi.spyOn(input, "click").mockImplementation(() => {});
    query(element, "button.upload").click();
    expect(pick).toHaveBeenCalledOnce();
    expect(query(element, "button.paste").title).toBe("Paste");
    const choose = async (files: File[]) => {
      Object.defineProperty(input, "files", {
        value: files,
        configurable: true,
      });
      input.dispatchEvent(new Event("change"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await element.updateComplete;
    };
    await choose([new File(["x"], "a.png")]);
    expect(draft(element)).toMatchObject({ image: shape.image, height: 10 });
    expect(query(element, ".shape-preview").classList.contains("image")).toBe(
      true,
    );
    await choose([]);
    vi.mocked(element.readClipboard)
      .mockResolvedValueOnce({ ...shape, height: 40 })
      .mockRejectedValueOnce(
        new ShapeImageError("There is no PNG image to paste"),
      )
      .mockRejectedValueOnce(new Error("odd"));
    await click(element, "button.paste");
    expect(draft(element).height).toBe(20);
    await click(element, "button.paste");
    await click(element, "button.paste");
    expect(events).toEqual([
      ["pc-toast", "error: There is no PNG image to paste"],
      ["pc-toast", "error: Couldn't use the brush shape"],
    ]);
  });

  it("should pick a built-in shape from a menu on the shape, marking the one used", async () => {
    const { element } = await setup();
    const menu = () =>
      query<PcContextMenu>(element, "pc-context-menu.shape-menu");
    // Round 20 uses the round shape
    expect(menu().label).toBe("Choose a shape");
    expect(menu().items).toEqual(
      BUILT_IN_SHAPES.map((shape) => ({
        value: shape.id,
        label: shape.name,
        image: shape.image,
        selected: shape.id === "round",
      })),
    );
    expect(menu().querySelector(".shape-box")?.slot).toBe("icon");
    expect(menu().querySelector(".shape-box .shape-preview")).not.toBeNull();
    const pick = async (value: string) => {
      menu().dispatchEvent(new CustomEvent("pc-select", { detail: { value } }));
      await element.updateComplete;
    };
    // Picking one uses its image, square at the current width
    await slide(element, "height", 5);
    await pick("splatter");
    const splatter = BUILT_IN_SHAPES.find((s) => s.id === "splatter")!;
    expect(draft(element)).toMatchObject({
      image: splatter.image,
      width: 20,
      height: 20,
    });
    expect(
      menu().items.find((item) => "selected" in item && item.selected),
    ).toMatchObject({ value: "splatter" });
    // An uploaded or pasted shape marks none; anything unknown changes nothing
    await click(element, "button.paste");
    expect(
      menu().items.some((item) => "selected" in item && item.selected),
    ).toBe(false);
    await pick("unknown");
    expect(draft(element).image).toBe(shape.image);
  });
  it("should pick a built-in shape at width 1 when the settings have no width", async () => {
    const { element } = await setup({ config: {} });
    const menu = query<PcContextMenu>(element, "pc-context-menu.shape-menu");
    // No image: drawn round
    expect(menu.items[0]).toMatchObject({ value: "round", selected: true });
    menu.dispatchEvent(
      new CustomEvent("pc-select", { detail: { value: "square" } }),
    );
    expect(draft(element).width).toBeUndefined();
    expect(draft(element).height).toBe(1);
  });
  it("should size an uploaded shape from its own width when the settings have none", async () => {
    const { element } = await setup({ config: {} });
    await click(element, "button.paste");
    expect(draft(element)).toMatchObject({ height: 20 });
  });

  it("should add the settings to the user's presets, select the new preset, and save to it afterwards", async () => {
    const { app, element, events } = await setup();
    await slide(element, "spacing", 7);
    await element.addToPresets();
    const [saved] = app.customPresets.presets;
    expect(saved).toMatchObject({
      name: "My brush",
      content: { spacing: 7 },
      author: { handle: TEST_HANDLE },
    });
    expect(app.brush.presetId).toBe(saved!.id);
    expect(element.prompt).toHaveBeenCalledWith({
      heading: "Add to presets",
      label: "Name of the preset",
      value: "Round 20px",
      confirm: "Save",
      cancel: "Cancel",
    });
    expect(events).toEqual([
      [
        "pc-save",
        {
          config: expect.objectContaining({ spacing: 7 }),
          name: "My brush",
        },
      ],
      ["pc-toast", 'success: Saved "My brush" to My presets'],
    ]);
    // Still open, editing the new preset, which Save now saves to
    expect([element.editingId, element.draftName, element.unsaved]).toEqual([
      saved!.id,
      "My brush",
      false,
    ]);
    await element.updateComplete;
    expect(query<HTMLButtonElement>(element, "button.save").disabled).toBe(
      false,
    );
    await slide(element, "spacing", 3);
    await click(element, "button.save");
    expect(app.customPresets.presets).toHaveLength(1);
    expect(app.customPresets.get(saved!.id)?.content.spacing).toBe(3);
  });
  it("should ask before replacing one of the user's presets with the same name", async () => {
    const { app, element } = await setup({ kind: "eraser" });
    await element.addToPresets();
    const id = app.customPresets.presets[0]!.id;
    vi.mocked(element.confirm).mockReturnValueOnce(false);
    await element.addToPresets();
    expect(app.customPresets.presets).toHaveLength(1);
    await element.addToPresets();
    expect(element.confirm).toHaveBeenCalledWith({
      heading: "Replace preset",
      message: 'You already have a preset called "My brush". Replace it?',
      confirm: "Replace",
      cancel: "Cancel",
      cancelling: true,
    });
    expect(app.customPresets.presets.map((preset) => preset.id)).toEqual([id]);
    expect(app.eraser.presetId).toBe(id);
  });

  it("should not add a preset without a name, and say when saving fails", async () => {
    const { app, element, events } = await setup();
    vi.mocked(element.prompt)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("  ");
    await element.addToPresets();
    await element.addToPresets();
    expect(app.customPresets.presets).toEqual([]);
    vi.spyOn(app.customPresets, "save").mockRejectedValueOnce(
      new Error("full"),
    );
    await click(element, "button.add");
    expect(events).toEqual([["pc-toast", 'error: Couldn\'t save "My brush"']]);
    expect(element.editingId).toBeUndefined();
    expect(element.busy).toBe(false);
  });

  it("should delete the preset being edited, after confirming", async () => {
    const { app, element, events } = await setup();
    expect(queryAll(element, "button.delete")).toHaveLength(0);
    await element.deletePreset();
    const preset = app.newPreset({}, "Old brush");
    await app.customPresets.save(preset);
    element.editingId = preset.id;
    await element.updateComplete;
    vi.mocked(element.confirm).mockReturnValueOnce(false);
    await click(element, "button.delete");
    expect(app.customPresets.presets).toHaveLength(1);
    vi.spyOn(app.customPresets, "remove").mockRejectedValueOnce(
      new Error("no"),
    );
    await element.deletePreset();
    await element.deletePreset();
    expect(element.confirm).toHaveBeenCalledWith({
      heading: "Delete preset",
      message: 'Delete "Old brush"? This can\'t be undone.',
      confirm: "Delete",
      cancel: "Cancel",
      cancelling: true,
    });
    expect(app.customPresets.presets).toEqual([]);
    element.editingId = "gone";
    await element.deletePreset();
    expect(events).toEqual([
      ["pc-toast", 'error: Couldn\'t delete "Old brush"'],
      ["pc-toast", 'success: Deleted "Old brush"'],
      ["pc-close", null],
      ["pc-toast", 'success: Deleted "this preset"'],
      ["pc-close", null],
    ]);
  });

  it("should do nothing without an app", async () => {
    const element = await mount<PcBrushConfig>("pc-brush-config", {
      config: {},
    });
    await element.addToPresets();
    element.editingId = "a";
    await element.deletePreset();
    expect(element.busy).toBe(false);
  });

  it("should ask in dialogs and use the clipboard by default", async () => {
    const element = await mount<PcBrushConfig>("pc-brush-config", {
      config: {},
    });
    const question = { heading: "Sure?", confirm: "Yes", cancel: "No" };
    /** The dialog asking, in the window */
    const asking = async () => {
      const dialog = await vi.waitFor(() =>
        query<PcDialog>(element, "pc-dialog"),
      );
      await dialog.updateComplete;
      return dialog;
    };
    const confirmed = element.confirm(question);
    (await asking()).choose(CANCEL_CHOICE);
    expect(await confirmed).toBe(false);
    const named = element.prompt({ ...question, label: "Name", value: "x" });
    (await asking()).choose(OK_CHOICE);
    expect(await named).toBe("x");
    const chosen = element.choose({
      heading: "Save?",
      choices: [{ value: "save", label: "Save" }],
      cancel: "Cancel",
    });
    const choosing = await asking();
    expect(choosing.choices.map((choice) => choice.value)).toEqual([
      "save",
      CANCEL_CHOICE,
    ]);
    choosing.choose("save");
    expect(await chosen).toBe("save");
    Object.defineProperty(navigator, "clipboard", {
      value: { read: async () => [] },
      configurable: true,
    });
    await expect(element.readClipboard()).rejects.toThrow(
      "There is no PNG image to paste",
    );
    // Image data copied on the canvas is used instead (jsdom can't decode it)
    element.app = createApp();
    vi.spyOn(element.app, "copiedPng").mockResolvedValue(
      new Blob([], { type: "image/png" }),
    );
    await expect(element.readClipboard()).rejects.toThrow(
      "Couldn't read the brush shape image",
    );
    await expect(
      element.readShape(new File([], "shape.jpg", { type: "image/jpeg" })),
    ).rejects.toThrow(SHAPE_ERRORS.type);
    vi.restoreAllMocks();
  });

  it("should handle settings without a size or name", async () => {
    const { element } = await setup({
      config: { constrainProportions: true },
      presetName: undefined,
    });
    await slide(element, "width", 8);
    expect([draft(element).width, draft(element).height]).toEqual([8, 8]);
    element.draft = { constrainProportions: true };
    await element.updateComplete;
    await click(element, "input.width.randomise");
    expect(draft(element).height).toBe(1);
    await element.addToPresets();
    expect(element.prompt).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: "Name of the preset", value: "" }),
    );
    // A name given and taken away again
    element.presetName = "Named";
    await element.updateComplete;
    expect(element.draftName).toBe("Named");
    element.presetName = undefined;
    await element.updateComplete;
    expect(element.draftName).toBe("");
  });

  it.each(["brush", "eraser"] as const)(
    "should turn snapping to the pixel grid on and off for the %s",
    async (kind) => {
      const { element, events } = await setup({ kind });
      const snap = query<PcToggleCheckbox>(element, ".snap");
      const snapSwitch = shadow<HTMLInputElement>(snap, "input");
      expect(snap.checked).toBe(false);
      snapSwitch.click();
      await element.updateComplete;
      expect(draft(element).snapToPixelGrid).toBe(true);
      expect(events).toEqual([]);
      snapSwitch.click();
      expect(draft(element).snapToPixelGrid).toBe(false);
    },
  );

  it("should change the sample rate and spacing with both inputs", async () => {
    const { element } = await setup();
    await slide(element, "sample-rate", 40);
    await slide(element, "spacing", 12);
    expect(draft(element)).toMatchObject({ sampleRate: 40, spacing: 12 });
    // Each named, with a tip explaining it
    expect(
      queryAll(element, ".stroke-column .named").map((name) => [
        [...name.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join("")
          .trim(),
        name.querySelector("pc-info-tip")?.textContent?.trim().split(":")[0],
      ]),
    ).toEqual([
      ["Smoothing", "How the stroke curves between the points it samples"],
      [
        "Sample rate",
        "How many times a second the pen's position is sampled while drawing",
      ],
      ["Spacing", "How far apart stamps are along the stroke, in pixels"],
    ]);
    element.save();
    element.draft = undefined;
    element.save();
  });

  it("should translate brush shape errors, and say why for other errors", async () => {
    const app = createApp();
    const element = await mount<PcBrushConfig>("pc-brush-config", {
      app,
      config: app.brush.preset,
    });
    const toasts: unknown[] = [];
    element.addEventListener("pc-toast", (e) =>
      toasts.push((e as CustomEvent).detail),
    );
    element.readClipboard = () =>
      Promise.reject(new ShapeImageError(SHAPE_ERRORS.noImage));
    query(element, "button.paste").click();
    await vi.waitFor(() => expect(toasts).toHaveLength(1));
    element.readClipboard = () => Promise.reject(new Error("Blocked"));
    query(element, "button.paste").click();
    await vi.waitFor(() => expect(toasts).toHaveLength(2));
    expect(toasts).toEqual([
      { message: "There is no PNG image to paste", kind: "error" },
      { message: "Couldn't use the brush shape", kind: "error" },
    ]);
  });

  it("should read the clipboard by default", async () => {
    const element = await mount<PcBrushConfig>("pc-brush-config");
    // jsdom has no clipboard to read from
    await expect(element.readClipboard()).rejects.toBeDefined();
  });
});
