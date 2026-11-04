import { afterEach, describe, it, expect, vi } from "vitest";
import "..";
import {
  CONTEXT_MENU_TOGGLE_EVENT,
  MENU_MARGIN,
  menuLeft,
  menuTop,
  type PcContextMenu,
} from "..";
import type { PcMenu } from "../../PcMenu";
import { events, mount, query } from "../../../../testing/elements";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const items = [
  { value: "duplicate", label: "Duplicate" },
  { value: "delete", label: "Delete", danger: true },
];

/** A context menu with its own menu of items, and its button placed at (10, 20), 30px square */
const setup = async (properties: Partial<PcContextMenu> = {}) => {
  const element = await mount<PcContextMenu>("pc-context-menu", {
    items,
    label: "Layer actions",
    ...properties,
  });
  const button = query<HTMLButtonElement>(element, "button");
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 20, 30, 30),
  );
  const toggles = events<{ open: boolean }>(element, CONTEXT_MENU_TOGGLE_EVENT);
  /** Press the button and wait for the menu to be placed */
  const press = async () => {
    button.click();
    await element.updateComplete;
    await element.menu?.updateComplete;
  };
  return { element, button, toggles, press };
};

describe("menuTop and menuLeft", () => {
  it("should keep a menu within the window, but not past its top or left margin", () => {
    expect(menuTop(100, 300, 800)).toBe(100);
    expect(menuTop(700, 300, 800)).toBe(800 - MENU_MARGIN - 300);
    expect(menuTop(700, 900, 800)).toBe(MENU_MARGIN);
    expect(menuLeft(100, 200, 1000)).toBe(100);
    expect(menuLeft(900, 200, 1000)).toBe(1000 - MENU_MARGIN - 200);
    expect(menuLeft(900, 2000, 1000)).toBe(MENU_MARGIN);
  });
});

describe("pc-context-menu", () => {
  it("should show a ⋮ button for its menu, named for screen readers", async () => {
    const { element, button } = await setup();
    expect(button.textContent?.trim()).toBe("⋮");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Layer actions");
    expect(element.menu?.label).toBe("Layer actions");
    // Its own menu is named like the button unless given a menu label
    element.menuLabel = "Actions";
    await element.updateComplete;
    expect(element.menu?.label).toBe("Actions");
    expect(element.open).toBe(false);
    const unnamed = await mount<PcContextMenu>("pc-context-menu");
    expect(query(unnamed, "button").hasAttribute("aria-label")).toBe(false);
    expect(unnamed.menu).toBeUndefined();
  });

  it("should open its menu under the button, telling listeners, and close it on a second press", async () => {
    const { element, button, toggles, press } = await setup({
      menuLabel: "Actions",
    });
    await press();
    const menu = element.menu as PcMenu;
    expect([element.open, menu.open]).toEqual([true, true]);
    expect([menu.x, menu.y]).toEqual([10, 50]);
    expect(menu.label).toBe("Actions");
    expect(menu.anchor).toBe(element);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await press();
    expect([element.open, menu.open]).toEqual([false, false]);
    expect(toggles).toEqual([{ open: true }, { open: false }]);
  });

  it("should open beside the button, moved to stay within the window", async () => {
    const { element, press } = await setup({ placement: "beside" });
    const menu = element.menu as PcMenu;
    Object.defineProperty(menu, "offsetWidth", { value: 5000 });
    Object.defineProperty(menu, "offsetHeight", { value: 100 });
    await press();
    await menu.updateComplete;
    expect([menu.x, menu.y]).toEqual([MENU_MARGIN, 20]);
  });

  it("should open and close on a right-click instead of the browser's menu", async () => {
    const { element, button } = await setup();
    const event = new MouseEvent("contextmenu", { cancelable: true });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(element.open).toBe(true);
    button.dispatchEvent(new MouseEvent("contextmenu", { cancelable: true }));
    expect(element.open).toBe(false);
  });

  it("should pass on the chosen item and close, returning focus to the button", async () => {
    const { element, button, press } = await setup();
    const chosen = events<{ value: string }>(element, "pc-select");
    await press();
    const menu = element.menu as PcMenu;
    query<HTMLButtonElement>(menu, '[data-value="duplicate"]').click();
    await element.updateComplete;
    expect(chosen).toEqual([{ value: "duplicate" }]);
    expect(element.open).toBe(false);
    expect(element.shadowRoot!.activeElement).toBe(button);
  });

  it("should close on a press outside, but not on its own button, leaving focus where it went", async () => {
    const { element, button, press } = await setup();
    await press();
    button.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    expect(element.open).toBe(true);
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await element.updateComplete;
    expect(element.open).toBe(false);
    expect(document.activeElement).toBe(outside);
  });

  it("should close on scroll, and stop listening once closed or removed", async () => {
    const { element, press } = await setup();
    await press();
    window.dispatchEvent(new Event("scroll"));
    await element.updateComplete;
    expect(element.open).toBe(false);
    const remove = vi.spyOn(window, "removeEventListener");
    await press();
    element.remove();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), true);
  });

  it("should open a slotted menu and icon instead of its own", async () => {
    const element = await mount<PcContextMenu>(
      "pc-context-menu",
      { label: "More" },
      '<span slot="icon">☰</span><pc-menu slot="menu" label="Mine"></pc-menu>',
    );
    const slotted = element.querySelector<PcMenu>("pc-menu")!;
    slotted.items = items;
    await element.updateComplete;
    expect(element.menu).toBe(slotted);
    expect(slotted.label).toBe("Mine");
    query<HTMLButtonElement>(element, "button").click();
    await element.updateComplete;
    expect(slotted.open).toBe(true);
    // A menu slotted later is set up like the current one
    const later = document.createElement("pc-menu") as PcMenu;
    later.slot = "menu";
    slotted.remove();
    element.append(later);
    await new Promise((resolve) => setTimeout(resolve));
    await element.updateComplete;
    expect(element.menu).toBe(later);
    expect([later.open, later.label, later.anchor]).toEqual([
      true,
      "More",
      element,
    ]);
  });

  it("should not open while disabled, or tell listeners when nothing changes", async () => {
    const { element, button, toggles } = await setup({ disabled: true });
    expect(button.disabled).toBe(true);
    element.setOpen(true);
    element.setOpen(false);
    expect(element.open).toBe(false);
    expect(toggles).toEqual([]);
  });
});
