import { afterEach, describe, it, expect } from "vitest";
import { LitElement, html } from "lit";
import {
  LayoutStateController,
  STATE_EVENT,
  findLayout,
  matchesState,
  parseSideModes,
  sideModeFor,
  type LayoutState,
} from "..";

afterEach(() => document.body.replaceChildren());

const state: LayoutState = {
  width: 500,
  narrow: true,
  input: "pen",
  uiHidden: false,
  leftMode: "rail",
  rightMode: "floating",
};

describe("parseSideModes", () => {
  it("should read modes with the widths they apply below, leaving out invalid ones", () => {
    expect(parseSideModes("docked, rail@600, floating@400")).toEqual([
      { mode: "docked" },
      { mode: "rail", below: 600 },
      { mode: "floating", below: 400 },
    ]);
    expect(parseSideModes("sideways, rail@wide, floating@300, ")).toEqual([
      { mode: "floating", below: 300 },
    ]);
  });
});

describe("sideModeFor", () => {
  const rules = parseSideModes("docked, rail@600, floating@400");

  it.each([
    [1000, "docked"],
    [600, "docked"],
    [599, "rail"],
    [400, "rail"],
    [399, "floating"],
  ])("should use the right mode at %ipx", (width, mode) => {
    expect(sideModeFor(rules, width)).toBe(mode);
  });

  it("should dock without a mode for wide layouts", () => {
    expect(sideModeFor(parseSideModes("rail@600"), 800)).toBe("docked");
    expect(sideModeFor([], 100)).toBe("docked");
  });
});

describe("matchesState", () => {
  it.each([
    ["narrow", true],
    ["!narrow", false],
    ["input:pen", true],
    ["input:touch", false],
    ["!input:touch narrow", true],
    ["ui-hidden", false],
    ["left:rail right:floating", true],
    ["left:docked", false],
    ["unknown", false],
    ["", true],
  ])("should check %j", (condition, expected) => {
    expect(matchesState(condition, state)).toBe(expected);
  });
});

class StateSourceElement extends HTMLElement {
  state = state;
}
customElements.define("paint-canvas", StateSourceElement);

class InnerElement extends LitElement {
  readonly layout = new LayoutStateController(this);
  renders = 0;
  override render() {
    this.renders += 1;
    return html`${this.layout.state?.narrow}`;
  }
}
customElements.define("inner-element", InnerElement);

class WrapperElement extends LitElement {
  override render() {
    return html`<inner-element></inner-element>`;
  }
}
customElements.define("wrapper-element", WrapperElement);

describe("findLayout and LayoutStateController", () => {
  it("should find the layout around an element, through shadow roots, and follow its state", async () => {
    const layout = document.createElement("paint-canvas") as StateSourceElement;
    const wrapper = document.createElement("wrapper-element") as WrapperElement;
    layout.append(wrapper);
    document.body.append(layout);
    await wrapper.updateComplete;
    const inner = wrapper.shadowRoot!.querySelector(
      "inner-element",
    ) as InnerElement;
    await inner.updateComplete;
    expect(findLayout(inner)).toBe(layout);
    expect(inner.layout.state).toBe(state);
    const before = inner.renders;
    layout.dispatchEvent(new Event(STATE_EVENT));
    await inner.updateComplete;
    expect(inner.renders).toBe(before + 1);
    inner.remove();
    expect(inner.layout.state).toBeUndefined();
  });

  it("should find no layout outside one", () => {
    const element = document.createElement("div");
    document.body.append(element);
    expect(findLayout(element)).toBeUndefined();
  });
});
