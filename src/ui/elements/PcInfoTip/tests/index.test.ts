import { afterEach, describe, it, expect, vi } from "vitest";
import "..";
import { clippingRight, type PcInfoTip } from "..";
import { mount, shadow } from "../../../../testing/elements";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("pc-info-tip", () => {
  it("should show and hide its explanation, closing on Escape, blur or a press outside", async () => {
    const tip = await mount<PcInfoTip>("pc-info-tip", {}, "Explained");
    const button = shadow<HTMLButtonElement>(tip, "button");
    expect(button.getAttribute("aria-label")).toBe("More information");
    expect(tip.shadowRoot!.querySelector("[role=tooltip]")).toBeNull();
    const reopen = async () => {
      tip.open = true;
      await tip.updateComplete;
    };
    button.click();
    await tip.updateComplete;
    expect([
      button.getAttribute("aria-expanded"),
      button.getAttribute("aria-describedby"),
    ]).toEqual(["true", "tip"]);
    button.click();
    expect(tip.open).toBe(false);
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await reopen();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(tip.open).toBe(true);
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(tip.open).toBe(false);
    await reopen();
    button.dispatchEvent(new Event("blur"));
    expect(tip.open).toBe(false);
    await reopen();
    button.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    expect(tip.open).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(tip.open).toBe(false);
    tip.remove();
  });

  it("should use the label given", async () => {
    const tip = await mount<PcInfoTip>("pc-info-tip", {
      label: "About focus pen",
    });
    expect(shadow(tip, "button").getAttribute("aria-label")).toBe(
      "About focus pen",
    );
  });
});

/** A box at a right edge, for jsdom (which has no layout) */
const at = (element: Element, right: number) =>
  vi
    .spyOn(element, "getBoundingClientRect")
    .mockReturnValue({ right } as DOMRect);

describe("clippingRight", () => {
  it("should find the nearest ancestor as shown that clips or scrolls sideways, through slots and shadow roots", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const slot = document.createElement("slot");
    root.append(slot);
    scroller.append(host);
    const inner = document.createElement("span");
    host.append(inner);
    document.body.append(scroller);
    at(scroller, 300);
    // Through the slot it's shown in, then up past the shadow root's host
    expect(clippingRight(inner)).toBe(300);
    // In a shadow root, up through its host
    const deep = document.createElement("b");
    root.append(deep);
    expect(clippingRight(deep)).toBe(300);
    expect(clippingRight(document.createElement("i"))).toBe(Infinity);
  });
});

describe("pc-info-tip placement", () => {
  it("should move the tip left as far as it needs to stay inside what clips it, or the page", async () => {
    const box = document.createElement("div");
    box.style.overflowX = "hidden";
    document.body.append(box);
    const tip = await mount<PcInfoTip>("pc-info-tip", {}, "Explained");
    box.append(tip);
    at(box, 300);
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: 1000,
      configurable: true,
    });
    const place = async (right: number) => {
      tip.open = false;
      await tip.updateComplete;
      const proto = HTMLElement.prototype;
      const spy = vi
        .spyOn(proto, "getBoundingClientRect")
        .mockReturnValue({ right } as DOMRect);
      tip.open = true;
      await tip.updateComplete;
      spy.mockRestore();
      return shadow<HTMLElement>(tip, "[role=tooltip]").style.left;
    };
    // 50px past the edge (less the margin): moved left by that much
    expect(await place(342)).toBe("-50px");
    // Inside: where it is
    expect(await place(200)).toBe("");
    // Narrower page than the box
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: 250,
      configurable: true,
    });
    expect(await place(250)).toBe("-8px");
  });
});
