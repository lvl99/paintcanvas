import { describe, it, expect, afterEach } from "vitest";
import "..";
import { THEMES, isTheme, type PcThemePicker } from "..";
import { DEFAULT_ICONS } from "../../../icons";
import { events, mount, query, queryAll } from "../../../../testing/elements";

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset.pcTheme;
});

/** The radio for a theme */
const radio = (element: PcThemePicker, theme: string) =>
  query<HTMLInputElement>(element, `input[value="${theme}"]`);

describe("isTheme", () => {
  it("should recognise only the themes", () => {
    expect(THEMES.every(isTheme)).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe("pc-theme-picker", () => {
  it("should offer light, dark and auto as labelled radios with their icons, light picked by default", async () => {
    const element = await mount<PcThemePicker>("pc-theme-picker");
    expect(query(element, "legend").textContent).toBe("Theme");
    expect(
      queryAll(element, "label").map((label) => [
        label.textContent?.trim(),
        label.querySelector("img")?.getAttribute("src"),
        label.querySelector("input")?.type,
      ]),
    ).toEqual([
      ["Light", DEFAULT_ICONS.sun, "radio"],
      ["Dark", DEFAULT_ICONS.moon, "radio"],
      ["Auto", DEFAULT_ICONS.star, "radio"],
    ]);
    expect(radio(element, "light").checked).toBe(true);
    expect(document.documentElement.dataset.pcTheme).toBeUndefined();
  });

  it("should show the page's theme, and set it when picked", async () => {
    document.documentElement.dataset.pcTheme = "auto";
    const element = await mount<PcThemePicker>("pc-theme-picker");
    expect(element.theme).toBe("auto");
    expect(radio(element, "auto").checked).toBe(true);
    const changes = events(element, "change");
    radio(element, "dark").click();
    await element.updateComplete;
    expect(document.documentElement.dataset.pcTheme).toBe("dark");
    expect(element.getAttribute("theme")).toBe("dark");
    expect(changes).toEqual(["dark"]);
  });

  it("should show and set the theme of a target instead, ignoring one it doesn't know", async () => {
    const target = document.createElement("div");
    target.dataset.pcTheme = "sepia";
    document.body.append(target);
    const element = document.createElement("pc-theme-picker") as PcThemePicker;
    element.target = target;
    document.body.append(element);
    await element.updateComplete;
    expect(element.theme).toBe("light");
    element.pick("dark");
    expect(target.dataset.pcTheme).toBe("dark");
    expect(document.documentElement.dataset.pcTheme).toBeUndefined();
  });
});
