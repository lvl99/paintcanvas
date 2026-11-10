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

/** Set a single slider's value, as dragging it does, and wait for the window to update */
const slide = async (element: PcBrushConfig, name: string, value: number) => {
  query<PcSliderRange>(element, `pc-slider-range.${name}`).setEnd(
    "high",
    value,
    "pc-input",
  );
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
    ]).toEqual([true, true, true, false, "Brush configuration"]);
    expect(query(element, ".name-field").slot).toBe("header-start");
    expect(query(element, ".settings").slot).toBe("body");
    expect(query(element, ".actions").slot).toBe("footer-end");
    await enter(element, "input.name", "Renamed", "input");
    expect(draft(element).name).toBe("Renamed");
    expect(config.name).toBe("Round 20px");
    // The window stays for the layout to remove
    dialogWindow.requestClose("close");
    dialogWindow.requestClose("escape");
    expect(dialogWindow.open).toBe(true);
    expect(events).toEqual([
      ["pc-close", null],
      ["pc-close", null],
    ]);
  });

  it("should name the eraser's window", async () => {
    const { element } = await setup({ kind: "eraser" });
    expect(query<PcDialogWindow>(element, "pc-dialog-window").label).toBe(
      "Eraser configuration",
    );
  });

  it("should save the changed settings to the current tool", async () => {
    const { element, events } = await setup();
    await slide(element, "spacing", 9);
    await slide(element, "sample-rate", 100);
    await click(element, "button.save");
    expect(events).toEqual([
      ["pc-save", expect.objectContaining({ spacing: 9, sampleRate: 100 })],
    ]);
  });

  it("should keep the height in proportion while constrained", async () => {
    const { element } = await setup();
    await slide(element, "width", 40);
    expect([draft(element).width, draft(element).height]).toEqual([40, 40]);
    expect(
      query<PcSliderRange>(element, "pc-slider-range.height").disabled,
    ).toBe(true);
    const constrain = query<HTMLInputElement>(element, "input.constrain");
    // A link toggle: linked while constrained, unlinked otherwise
    const icon = () =>
      query(element, "label.icon-toggle[title='Constrain proportions'] img")
        .getAttribute("src")
        ?.split("/")
        .pop();
    expect(icon()).toBe("icon-linked@2x.png");
    constrain.checked = false;
    constrain.dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(icon()).toBe("icon-unlinked@2x.png");
    await slide(element, "width", 10);
    await slide(element, "height", 30);
    expect([draft(element).width, draft(element).height]).toEqual([10, 30]);
  });

  it("should vary settings with pressure, tilt and randomness, with a min and max", async () => {
    const { element } = await setup();
    await click(element, "input.width.pressure");
    expect(draft(element).widthConfig).toMatchObject({ usePressure: true });
    // The height follows the width's variation while constrained
    expect(draft(element).heightConfig).toEqual(draft(element).widthConfig);
    expect(
      query<HTMLInputElement>(element, "input.width.pressure").checked,
    ).toBe(true);
    // The min and max are a range slider's ends, changed while dragging and once let go
    const range = () => query<PcSliderRange>(element, "pc-slider-range.width");
    expect([range().label, range().min, range().max]).toEqual([
      "Width",
      1,
      256,
    ]);
    expect([range().low, range().high]).toEqual([10, 20]);
    range().setEnd("low", 5, "pc-input");
    range().setEnd("high", 30);
    await element.updateComplete;
    expect(draft(element).width).toBe(30);
    expect(draft(element).widthConfig?.minPressure).toBeCloseTo(5 / 30);
    range().setEnd("low", 30);
    await element.updateComplete;
    expect(draft(element).widthConfig?.minPressure).toBe(1);
    // One source at a time: choosing tilt keeps the range; choosing it again turns variation off
    await click(element, "input.width.tilt");
    expect(draft(element).widthConfig).toMatchObject({
      usePressure: false,
      useTilt: true,
      minTilt: 1,
    });
    expect(
      ["pressure", "tilt", "randomise"].map(
        (source) =>
          query<HTMLInputElement>(element, `input.width.${source}`).checked,
      ),
    ).toEqual([false, true, false]);
    await click(element, "input.width.tilt");
    expect(draft(element).widthConfig).toMatchObject({ useTilt: false });
    expect(query<HTMLInputElement>(element, "input.width.tilt").checked).toBe(
      false,
    );
    // Back to a single value
    expect(query<PcSliderRange>(element, "pc-slider-range.width").single).toBe(
      true,
    );
  });

  it("should show pressure, tilt and randomise as one group of icon radio buttons on each setting that varies", async () => {
    const { element } = await setup();
    const group = query<HTMLFieldSetElement>(
      element,
      '[data-param="width"] fieldset.sources',
    );
    expect(group.querySelector("legend")?.textContent?.trim()).toBe(
      "Width: vary with",
    );
    expect(
      [...group.querySelectorAll("input")].map((input) => [
        input.type,
        input.name,
      ]),
    ).toEqual([
      ["radio", "width-source"],
      ["radio", "width-source"],
      ["radio", "width-source"],
    ]);
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

  it("should edit a varying setting's profile graph, storing it unless it's a straight line", async () => {
    const { app, element } = await setup();
    const button = () =>
      query<HTMLButtonElement>(element, "button.profile.width");
    expect(button().disabled).toBe(true);
    expect(button().title).toBe("Width: profile graph");
    await click(element, "input.width.pressure");
    expect(button().disabled).toBe(false);
    await click(element, "button.profile.width");
    const editor = () => query<PcProfileEditor>(element, "pc-profile-editor");
    expect([editor().label, editor().profileId, editor().profiles]).toEqual([
      "Width",
      "linear",
      app.profiles,
    ]);
    const overweight = PROFILE_PRESETS[1]!.points;
    editor().dispatchEvent(
      new CustomEvent("pc-save", {
        detail: { points: overweight, profileId: "overweight" },
      }),
    );
    await element.updateComplete;
    expect(queryAll(element, "pc-profile-editor")).toHaveLength(0);
    expect(draft(element).widthConfig).toMatchObject({
      usePressure: true,
      profile: overweight,
      profileId: "overweight",
    });
    // The height follows while constrained
    expect(draft(element).heightConfig?.profileId).toBe("overweight");
    // Its button is purple while it has a profile graph
    expect(button().classList).toContain("configured");

    // Opened again: its graph; a straight line isn't stored
    await click(element, "button.profile.width");
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
    expect(draft(element).widthConfig?.profile).toBeUndefined();
    expect(draft(element).widthConfig?.profileId).toBeUndefined();
    expect(button().classList).not.toContain("configured");

    // Points without an ID; closing changes nothing
    element.draft = {
      ...draft(element),
      alphaConfig: { useTilt: true, profile: overweight },
    };
    await element.updateComplete;
    await click(element, "button.profile.alpha");
    expect(editor().profileId).toBeUndefined();
    editor().dispatchEvent(new CustomEvent("pc-close"));
    await element.updateComplete;
    expect(queryAll(element, "pc-profile-editor")).toHaveLength(0);
    expect(draft(element).alphaConfig?.profile).toEqual(overweight);
  });

  it("should keep profile graphs of its own without a canvas", async () => {
    const element = await mount<PcBrushConfig>("pc-brush-config", {
      config: { id: "a", heightConfig: { useRandomise: true } },
    });
    await click(element, "button.profile.height");
    expect(
      query<PcProfileEditor>(element, "pc-profile-editor").profiles.graphs,
    ).toEqual([]);
  });

  it("should only let offsets change while they vary", async () => {
    const { element } = await setup();
    expect(
      query<PcSliderRange>(element, "pc-slider-range.offsetX").disabled,
    ).toBe(true);
    await click(element, "input.offsetX.randomise");
    query<PcSliderRange>(element, "pc-slider-range.offsetX").setEnd("high", 10);
    await element.updateComplete;
    expect(draft(element).offsetXConfig).toMatchObject({
      useRandomise: true,
      maxRandomise: 0.5,
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
      config: { id: "a", smoothingType: SmoothingType.None },
    });
    const radios = queryAll<HTMLInputElement>(element, "input[name=smoothing]");
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);
    radios[2]!.dispatchEvent(new Event("change"));
    expect(draft(element).smoothingType).toBe(SmoothingType.BezierCubic);
    element.config = { id: "b", smoothingType: SmoothingType.BezierQuad };
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

  it("should pick a built-in shape from a list over the shape, saying Custom for the user's own", async () => {
    const { element } = await setup();
    const select = () =>
      query<HTMLSelectElement>(element, "select.shape-select");
    const options = () =>
      [...select().options].map((option) => [
        option.value,
        option.textContent!.trim(),
      ]);
    // Round 20 uses the round shape
    expect(select().value).toBe("round");
    expect(select().getAttribute("aria-label")).toBe("Shape");
    expect(select().title).toBe("Choose a shape");
    expect(options()).toEqual(
      BUILT_IN_SHAPES.map((shape) => [shape.id, shape.name]),
    );
    expect(select().parentElement!.classList.contains("shape-picker")).toBe(
      true,
    );

    // Picking one uses its image, square at the current width
    await slide(element, "height", 5);
    select().value = "splatter";
    select().dispatchEvent(new Event("change"));
    await element.updateComplete;
    const splatter = BUILT_IN_SHAPES.find((s) => s.id === "splatter")!;
    expect(draft(element)).toMatchObject({
      image: splatter.image,
      width: 20,
      height: 20,
    });
    expect(select().value).toBe("splatter");

    // An uploaded or pasted shape is "Custom"
    await click(element, "button.paste");
    expect(options()[0]).toEqual(["custom", "Custom"]);
    expect(select().value).toBe("custom");
    // Picking "Custom" (or anything unknown) changes nothing
    select().dispatchEvent(new Event("change"));
    expect(draft(element).image).toBe(shape.image);
    select().value = "round";
    select().dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(options()[0]![0]).toBe("round");
  });

  it("should pick a built-in shape at width 1 when the settings have no width", async () => {
    const { element } = await setup({ config: { id: "a" } });
    const select = query<HTMLSelectElement>(element, "select.shape-select");
    // No image: drawn round
    expect(select.value).toBe("round");
    select.value = "square";
    select.dispatchEvent(new Event("change"));
    expect(draft(element).width).toBeUndefined();
    expect(draft(element).height).toBe(1);
  });

  it("should size an uploaded shape from its own width when the settings have none", async () => {
    const { element } = await setup({ config: { id: "a" } });
    await click(element, "button.paste");
    expect(draft(element)).toMatchObject({ height: 20 });
  });

  it("should add the settings to the user's presets, and select the new preset", async () => {
    const { app, element, events } = await setup();
    await slide(element, "spacing", 7);
    await element.addToPresets();
    const [saved] = app.customPresets.presets;
    expect(saved).toMatchObject({
      name: "My brush",
      spacing: 7,
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
      ["pc-toast", 'success: Saved "My brush" to My presets'],
      ["pc-close", null],
    ]);
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
    expect(element.busy).toBe(false);
  });

  it("should delete the preset being edited, after confirming", async () => {
    const { app, element, events } = await setup();
    expect(queryAll(element, "button.delete")).toHaveLength(0);
    await element.deletePreset();
    const preset = app.newPreset({ id: "x" }, "Old brush");
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
      config: { id: "a" },
    });
    await element.addToPresets();
    element.editingId = "a";
    await element.deletePreset();
    expect(element.busy).toBe(false);
  });

  it("should ask in dialogs and use the clipboard by default", async () => {
    const element = await mount<PcBrushConfig>("pc-brush-config", {
      config: { id: "a" },
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
    vi.restoreAllMocks();
  });

  it("should handle settings without a size or name", async () => {
    const { element } = await setup({
      config: { id: "a", constrainProportions: true },
    });
    await slide(element, "width", 8);
    expect([draft(element).width, draft(element).height]).toEqual([8, 8]);
    element.draft = { id: "b", constrainProportions: true };
    await element.updateComplete;
    await click(element, "input.width.randomise");
    expect(draft(element).height).toBe(1);
    await element.addToPresets();
    expect(element.prompt).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: "Name of the preset", value: "" }),
    );
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
      await click(element, "button.save");
      expect(events).toEqual([
        ["pc-save", expect.objectContaining({ snapToPixelGrid: true })],
      ]);
      snapSwitch.click();
      expect(draft(element).snapToPixelGrid).toBe(false);
    },
  );

  it("should change the sample rate and spacing with both inputs", async () => {
    const { element } = await setup();
    await slide(element, "sample-rate", 40);
    await slide(element, "spacing", 12);
    expect(draft(element)).toMatchObject({ sampleRate: 40, spacing: 12 });
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
