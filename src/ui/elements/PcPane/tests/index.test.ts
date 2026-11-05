import { afterEach, describe, it, expect } from "vitest";
import "..";
import { isDismissingPress } from "../../../dismiss";
import { PANE_COLLAPSE_EVENT, type PcPane } from "..";
import "../../PcPanel";
import type { PcPanel } from "../../PcPanel";
import { events, mount, query, queryAll } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

/** A panel for a pane */
const panelHtml = (label: string, extra = "") =>
  `<pc-panel icon="layers" label="${label}" ${extra}><button>Inside ${label}</button></pc-panel>`;

/** A pane with some content, in a mode, waiting for its slots to settle */
const setup = async (content: string, properties: Partial<PcPane> = {}) => {
  const pane = await mount<PcPane>("pc-pane", properties, content);
  await new Promise((resolve) => setTimeout(resolve));
  await pane.updateComplete;
  return pane;
};

/** Where a pane's child is shown: the region its slot is in */
const regionOf = (pane: PcPane, child: Element) =>
  [...pane.shadowRoot!.querySelectorAll("slot")]
    .find((slot) => slot.assignedElements().includes(child))
    ?.closest(".start, .middle, .end")?.className;

/** Press somewhere */
const pressOn = (target: EventTarget) => {
  const event = new Event("pointerdown", { bubbles: true, composed: true });
  target.dispatchEvent(event);
  return event;
};

/** Press a key on an element */
const pressKey = (target: EventTarget, key: string) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true }),
  );

describe("pc-pane", () => {
  it("should show content in its start, middle and end, and content without a slot at the start", async () => {
    const pane = await setup(
      '<p id="a">A</p><p id="b" slot="start">B</p><p id="c" slot="middle">C</p><p id="d" slot="end">D</p>',
    );
    const [a, b, c, d] = [...pane.children];
    expect([a, b, c, d].map((child) => regionOf(pane, child!))).toEqual([
      "start",
      "start",
      "middle",
      "end",
    ]);
    expect([pane.orientation, pane.mode, pane.edge]).toEqual([
      "vertical",
      "docked",
      "left",
    ]);
    expect(pane.getAttribute("orientation")).toBe("vertical");
    expect(queryAll(pane, ".rail, .collapse")).toHaveLength(0);
  });

  it("should open its panels from a rail over the canvas, one at a time, and close them on Escape or a press outside", async () => {
    const pane = await setup(panelHtml("Layers") + panelHtml("Chat", "badge"), {
      mode: "rail",
      edge: "right",
      label: "Panels",
    });
    const [layers, chat] = [...pane.querySelectorAll<PcPanel>("pc-panel")] as [
      PcPanel,
      PcPanel,
    ];
    expect([
      layers.hasAttribute("data-pc-rail"),
      layers.hasAttribute("data-pc-open"),
    ]).toEqual([true, false]);
    expect(query(pane, ".rail").getAttribute("aria-label")).toBe("Panels");
    const buttons = queryAll<HTMLButtonElement>(pane, ".rail button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Layers",
      "Chat (new)",
    ]);
    expect(queryAll(pane, ".rail .badge")).toHaveLength(1);
    expect(query(pane, ".rail img").getAttribute("src")).toMatch(/layers/);
    buttons[0]!.click();
    await pane.updateComplete;
    // It opens beside the pane, away from its edge
    expect(layers.getAttribute("data-pc-open")).toBe("right");
    expect(document.activeElement?.textContent).toBe("Inside Layers");
    expect(buttons[0]!.getAttribute("aria-expanded")).toBe("true");
    buttons[1]!.click();
    expect([
      layers.hasAttribute("data-pc-open"),
      chat.hasAttribute("data-pc-open"),
    ]).toEqual([false, true]);
    // Pressing inside the panel or its button keeps it open
    pressOn(chat);
    expect(pane.openPanel).toBe(chat);
    expect(isDismissingPress(pressOn(document.body))).toBe(true);
    expect(pane.openPanel).toBeUndefined();
    buttons[1]!.click();
    pressKey(chat, "a");
    expect(pane.openPanel).toBe(chat);
    pressKey(chat, "Escape");
    expect(pane.openPanel).toBeUndefined();
    expect(pane.shadowRoot!.activeElement).toBe(buttons[1]);
    // The button closes it too
    buttons[1]!.click();
    buttons[1]!.click();
    expect(pane.openPanel).toBeUndefined();
    // With nothing open, Escape and presses do nothing
    pressKey(pane, "Escape");
    pressOn(document.body);
    expect(pane.openPanel).toBeUndefined();
  });

  it("should focus a panel without anything focusable, follow panels' names, and close panels when the rail goes", async () => {
    const pane = await setup(
      '<pc-panel icon="layers" label="Notes"><p>Text</p></pc-panel>',
      { mode: "rail" },
    );
    const panel = pane.querySelector<PcPanel>("pc-panel")!;
    const button = query<HTMLButtonElement>(pane, ".rail button");
    button.click();
    expect(document.activeElement).toBe(panel);
    expect(panel.getAttribute("data-pc-open")).toBe("left");
    panel.label = "Ideas";
    await new Promise((resolve) => setTimeout(resolve));
    await pane.updateComplete;
    expect(button.getAttribute("aria-label")).toBe("Ideas");
    pane.mode = "docked";
    await pane.updateComplete;
    expect(pane.openPanel).toBeUndefined();
    expect(panel.hasAttribute("data-pc-open")).toBe(false);
    expect(panel.hasAttribute("data-pc-rail")).toBe(false);
    expect(queryAll(pane, ".rail")).toHaveLength(0);
  });

  it("should show a rail over the canvas as an overlay, opening its panels beside it", async () => {
    const pane = await setup(panelHtml("Layers"), { mode: "overlay" });
    const panel = pane.querySelector<PcPanel>("pc-panel")!;
    expect(panel.hasAttribute("data-pc-rail")).toBe(true);
    query<HTMLButtonElement>(pane, ".rail button").click();
    expect(pane.openPanel).toBe(panel);
    expect(panel.getAttribute("data-pc-open")).toBe("left");
    pane.mode = "rail";
    await pane.updateComplete;
    // Still a rail, so the panel stays open
    expect(pane.openPanel).toBe(panel);
  });

  it("should open and close panels from code, and close one that's removed", async () => {
    const pane = await setup(panelHtml("Layers"), { mode: "rail" });
    const panel = pane.querySelector<PcPanel>("pc-panel")!;
    pane.closePanel(true);
    pane.togglePanel(panel);
    expect(pane.openPanel).toBe(panel);
    pane.togglePanel(panel);
    expect(pane.openPanel).toBeUndefined();
    pane.togglePanel(panel);
    panel.remove();
    await new Promise((resolve) => setTimeout(resolve));
    expect(pane.openPanel).toBeUndefined();
    // A rail without panels shows nothing
    await pane.updateComplete;
    expect(queryAll(pane, ".rail")).toHaveLength(0);
  });

  it("should float as a box that collapses to a button, telling listeners", async () => {
    const pane = await setup(panelHtml("Layers"), {
      mode: "floating",
      edge: "right",
      label: "Panels",
    });
    const collapses = events<{ collapsed: boolean }>(pane, PANE_COLLAPSE_EVENT);
    const toggle = query<HTMLButtonElement>(pane, ".collapse");
    expect([
      toggle.getAttribute("aria-expanded"),
      toggle.getAttribute("aria-label"),
      toggle.textContent?.trim(),
    ]).toEqual(["false", "Show Panels", "«"]);
    expect(query(pane, ".regions").hidden).toBe(true);
    toggle.click();
    await pane.updateComplete;
    expect([
      toggle.getAttribute("aria-label"),
      toggle.textContent?.trim(),
    ]).toEqual(["Hide Panels", "»"]);
    expect(query(pane, ".regions").hidden).toBe(false);
    expect(collapses).toEqual([{ collapsed: false }]);
    pane.edge = "left";
    pane.collapsed = true;
    await pane.updateComplete;
    expect(toggle.textContent?.trim()).toBe("»");
  });

  it("should stop listening when removed", async () => {
    const pane = await setup(panelHtml("Layers"), { mode: "rail" });
    const panel = pane.querySelector<PcPanel>("pc-panel")!;
    pane.togglePanel(panel);
    pane.remove();
    pressOn(document.body);
    expect(pane.openPanel).toBe(panel);
  });
});
