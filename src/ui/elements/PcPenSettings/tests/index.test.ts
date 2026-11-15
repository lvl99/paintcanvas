import { describe, it, expect, afterEach } from "vitest";
import "..";
import type { PcPenSettings } from "..";
import type { PcProfileEditor } from "../../PcProfileEditor";
import type { PcSliderRange } from "../../PcSliderRange";
import type { PcToggleCheckbox } from "../../PcToggleCheckbox";
import { mount, query, queryAll } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";
import { linearPoints, PROFILE_PRESETS } from "../../../../lib/profiles";

afterEach(() => document.body.replaceChildren());

/** Show the pen settings for the brush, with a 40px round brush that doesn't vary */
const setup = async (source: "pressure" | "tilt" = "pressure") => {
  const app = createApp();
  app.brush.select("round20");
  app.brush.update({
    widthConfig: {},
    heightConfig: {},
    alphaConfig: {},
    rotationConfig: {},
    constrainProportions: false,
  });
  app.brush.setSize(40, 40);
  const element = await mount<PcPenSettings>("pc-pen-settings", {
    app,
    settings: app.brush,
    source,
  });
  return { app, element };
};

/** A setting's switch */
const toggle = (element: PcPenSettings, param: string) =>
  query<PcToggleCheckbox>(element, `pc-toggle-checkbox.${param}`);

/** Turn a setting's switch on or off, as the user does */
const flip = async (element: PcPenSettings, param: string, on: boolean) => {
  toggle(element, param).dispatchEvent(
    new CustomEvent("change", { detail: { checked: on } }),
  );
  await element.updateComplete;
};

/** A setting's range */
const range = (element: PcPenSettings, param: string) =>
  query<PcSliderRange>(element, `pc-slider-range.${param}`);

describe("pc-pen-settings", () => {
  it("should show nothing without settings", async () => {
    const element = await mount<PcPenSettings>("pc-pen-settings");
    expect(queryAll(element, "h2, .param")).toHaveLength(0);
  });

  it("should show a heading, then width, constrain proportions, height, opacity and rotation, and a reset button", async () => {
    const { element } = await setup();
    expect(query(element, "h2").textContent).toBe("Pen pressure settings");
    expect(
      queryAll(element, "div.param, div.constrain").map(
        (row) => row.dataset.param ?? "constrain",
      ),
    ).toEqual(["width", "constrain", "height", "alpha", "rotation"]);
    expect(toggle(element, "alpha").textContent?.trim()).toBe("Opacity");
    expect(query(element, "button.reset").textContent?.trim()).toBe(
      "Reset to brush defaults",
    );
    // Off: the ranges and graph buttons are off too
    expect(toggle(element, "width").checked).toBe(false);
    expect(range(element, "width").disabled).toBe(true);
    expect(
      query<HTMLButtonElement>(element, "button.profile.width").disabled,
    ).toBe(true);
  });

  it("should vary a setting with the source alongside others, without changing the preset", async () => {
    const { app, element } = await setup();
    app.brush.update({ widthConfig: { useTilt: true, min: 0.25 } });
    await element.updateComplete;
    expect(toggle(element, "width").checked).toBe(false);
    // The setting's range shows, off, while this source is off
    expect(range(element, "width").disabled).toBe(true);
    expect(queryAll(element, "pc-slider-range.source-range")).toHaveLength(0);
    await flip(element, "width", true);
    expect(app.brush.preset.widthConfig).toMatchObject({
      usePressure: true,
      useTilt: true,
      min: 0.25,
      minPressure: 0,
      maxPressure: 1,
    });
    expect([range(element, "width").low, range(element, "width").high]).toEqual(
      [10, 40],
    );
    const sourceRange = query<PcSliderRange>(
      element,
      "pc-slider-range.width.source-range",
    );
    expect([sourceRange.low, sourceRange.high, sourceRange.label]).toEqual([
      0,
      100,
      "Width: Pen pressure",
    ]);
    await flip(element, "width", false);
    expect(app.brush.preset.widthConfig).toMatchObject({
      usePressure: false,
      useTilt: true,
    });
    expect(app.brush.selectedPreset?.content.widthConfig).toBeUndefined();
  });

  it("should change the setting's range in its unit, with the brush's size as the width's highest, and the source's range", async () => {
    const { app, element } = await setup();
    await flip(element, "width", true);
    range(element, "width").dispatchEvent(
      new CustomEvent("pc-change", { detail: { low: 15, high: 60 } }),
    );
    expect(app.brush.width).toBe(60);
    expect(app.brush.preset.widthConfig?.min).toBe(0.25);
    await element.updateComplete;
    query(element, "pc-slider-range.width.source-range").dispatchEvent(
      new CustomEvent("pc-input", { detail: { low: 20, high: 80 } }),
    );
    expect(app.brush.preset.widthConfig).toMatchObject({
      minPressure: 0.2,
      maxPressure: 0.8,
    });
    await flip(element, "height", true);
    range(element, "height").dispatchEvent(
      new CustomEvent("pc-input", { detail: { low: 10, high: 20 } }),
    );
    expect(app.brush.height).toBe(20);
    await flip(element, "alpha", true);
    range(element, "alpha").dispatchEvent(
      new CustomEvent("pc-change", { detail: { low: 25, high: 50 } }),
    );
    expect(app.brush.preset.alpha).toBe(0.5);
    expect(app.brush.preset.alphaConfig?.min).toBe(0.5);
  });

  it("should turn the height's controls off while proportions are constrained", async () => {
    const { app, element } = await setup();
    // Not set counts as off
    app.brush.apply({
      ...app.brush.preset,
      constrainProportions: undefined,
      width: 40,
      height: 40,
    });
    await element.updateComplete;
    const constrain = query<HTMLInputElement>(element, "input.constrain");
    expect(constrain.checked).toBe(false);
    constrain.checked = true;
    constrain.dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(app.brush.preset.constrainProportions).toBe(true);
    expect(toggle(element, "height").disabled).toBe(true);
    expect(range(element, "height").disabled).toBe(true);
    expect(toggle(element, "width").disabled).toBe(false);
  });

  it("should give the rotation a tilt range, and choose whether it follows the pen's lean, only with tilt", async () => {
    const { app, element } = await setup("tilt");
    expect(query(element, "h2").textContent).toBe("Pen tilt settings");
    await flip(element, "rotation", true);
    expect(app.brush.preset.rotationConfig).toMatchObject({
      useTilt: true,
      min: 0,
      max: 360,
    });
    expect(
      queryAll(element, "pc-slider-range.rotation.source-range"),
    ).toHaveLength(1);
    const lean = query<PcToggleCheckbox>(
      element,
      "pc-toggle-checkbox.follow-lean",
    );
    expect(lean.checked).toBe(false);
    lean.dispatchEvent(
      new CustomEvent("change", { detail: { checked: true } }),
    );
    await element.updateComplete;
    expect(app.brush.preset.rotationFollowsLean).toBe(true);
    expect(lean.checked).toBe(true);
    element.source = "pressure";
    await element.updateComplete;
    expect(queryAll(element, "pc-toggle-checkbox.follow-lean")).toHaveLength(0);
  });

  it("should put back the preset's settings, and not without a preset", async () => {
    const { app, element } = await setup();
    await flip(element, "alpha", true);
    query<HTMLButtonElement>(element, "button.reset").click();
    await element.updateComplete;
    expect(app.brush.preset.alphaConfig).toEqual(
      app.brush.selectedPreset?.content.alphaConfig ?? {},
    );
    expect(toggle(element, "alpha").checked).toBe(false);
    // A preset removed before the button shows it changes nothing
    const reset = query<HTMLButtonElement>(element, "button.reset");
    const before = app.brush.preset;
    app.brush.presetId = "gone";
    reset.click();
    expect(app.brush.preset).toBe(before);
    app.brush.update({});
    await element.updateComplete;
    expect(reset.disabled).toBe(true);
  });

  it("should edit a setting's profile graph, storing none for a straight line", async () => {
    const { app, element } = await setup();
    await flip(element, "width", true);
    const button = () =>
      query<HTMLButtonElement>(element, "button.profile.width");
    expect(button().title).toBe("Width (Pen pressure): profile graph");
    button().click();
    await element.updateComplete;
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
    expect(app.brush.preset.widthConfig).toMatchObject({
      usePressure: true,
      pressureProfile: overweight,
      pressureProfileId: "overweight",
    });
    expect(button().classList).toContain("configured");

    // Opened again: its graph; a straight line isn't stored
    button().click();
    await element.updateComplete;
    expect(editor().profileId).toBe("overweight");
    editor().dispatchEvent(
      new CustomEvent("pc-save", {
        detail: { points: linearPoints(), profileId: "linear" },
      }),
    );
    await element.updateComplete;
    expect(app.brush.preset.widthConfig?.pressureProfile).toBeUndefined();

    // Points without an ID; closing changes nothing
    app.brush.update({
      alphaConfig: { usePressure: true, profile: overweight },
    });
    await element.updateComplete;
    query<HTMLButtonElement>(element, "button.profile.alpha").click();
    await element.updateComplete;
    expect(editor().profileId).toBeUndefined();
    editor().dispatchEvent(new CustomEvent("pc-close"));
    await element.updateComplete;
    expect(queryAll(element, "pc-profile-editor")).toHaveLength(0);
    expect(app.brush.preset.alphaConfig?.profile).toEqual(overweight);

    // A setting whose variation is gone while its graph is edited starts from a straight line
    query<HTMLButtonElement>(element, "button.profile.alpha").click();
    await element.updateComplete;
    app.brush.apply({
      ...app.brush.preset,
      alphaConfig: undefined,
      width: 40,
      height: 40,
    });
    await element.updateComplete;
    expect(editor().profileId).toBe("linear");
  });

  it("should not edit profile graphs without a canvas to keep them", async () => {
    const { app, element } = await setup();
    element.app = undefined;
    await flip(element, "width", true);
    query<HTMLButtonElement>(element, "button.profile.width").click();
    await element.updateComplete;
    expect(queryAll(element, "pc-profile-editor")).toHaveLength(0);
    expect(app).toBeDefined();
  });
});
