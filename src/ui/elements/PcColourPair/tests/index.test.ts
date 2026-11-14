import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { COLOUR_CLICK_EVENT, type PcColourPair } from "..";
import { events, mount, query } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

/** A colour pair for a new canvas */
const setup = async () => {
  const app = createApp();
  const element = await mount<PcColourPair>("pc-colour-pair", { app });
  const button = (slot: string) =>
    query<HTMLButtonElement>(element, `button.${slot}`);
  const input = query<HTMLInputElement>(element, "input[type=color]");
  return { app, element, button, input };
};

describe("pc-colour-pair", () => {
  it("should render nothing without an app", async () => {
    const element = await mount<PcColourPair>("pc-colour-pair");
    expect(element.shadowRoot!.querySelector("button")).toBeNull();
    element.openPicker();
  });

  it("should show both colours, named with their values, marking the selected one", async () => {
    const { app, element, button } = await setup();
    expect(button("foreground").style.getPropertyValue("--colour")).toBe(
      "#000000",
    );
    expect(button("background").style.getPropertyValue("--colour")).toBe(
      "#ffffff",
    );
    expect(button("foreground").getAttribute("aria-label")).toBe(
      "Brush color (#000000)",
    );
    expect(button("background").title).toBe("Background color (#ffffff)");
    expect(button("foreground").getAttribute("aria-pressed")).toBe("true");
    expect(button("background").getAttribute("aria-pressed")).toBe("false");
    app.selectColour("background");
    app.setColour("#123456", "background");
    await element.updateComplete;
    // The selected colour is the brush colour
    expect(button("background").title).toBe("Brush color (#123456)");
    expect(button("foreground").title).toBe("Background color (#000000)");
    expect(button("background").getAttribute("aria-pressed")).toBe("true");
    expect(button("background").style.getPropertyValue("--colour")).toBe(
      "#123456",
    );
  });

  it("should tell listeners which colour was pressed", async () => {
    const { element, button } = await setup();
    const clicks = events<{ slot: string }>(element, COLOUR_CLICK_EVENT);
    button("background").click();
    button("foreground").click();
    expect(clicks.map((detail) => detail.slot)).toEqual([
      "background",
      "foreground",
    ]);
  });

  it("should set the selected colour from the browser's colour picker", async () => {
    const { app, element, input } = await setup();
    expect(input.value).toBe("#000000");
    app.selectColour("background");
    await element.updateComplete;
    expect(input.value).toBe("#ffffff");
    input.value = "#00ff00";
    input.dispatchEvent(new Event("input"));
    expect(app.colours).toEqual({
      foreground: "#000000",
      background: "#00ff00",
    });
  });

  it("should open the browser's colour picker, clicking the input where showPicker isn't available", async () => {
    const { element, input } = await setup();
    const showPicker = vi.fn();
    Object.defineProperty(input, "showPicker", {
      value: showPicker,
      configurable: true,
    });
    element.openPicker();
    expect(showPicker).toHaveBeenCalledOnce();
    showPicker.mockImplementation(() => {
      throw new Error("Not allowed");
    });
    const click = vi.spyOn(input, "click");
    element.openPicker();
    expect(click).toHaveBeenCalledOnce();
  });
});
