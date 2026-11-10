import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { isNarrowerThan, type ButtonMenuItem, type PcButtonMenu } from "..";
import type { PcContextMenu } from "../../PcContextMenu";
import { events, mount, query, queryAll } from "../../../../testing/elements";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const ITEMS: ButtonMenuItem[] = [
  { value: "cut", label: "Cut" },
  { value: "paste", label: "Paste", disabled: true },
];

/**
 * Stub `matchMedia` for a window of a width, returning a function that changes the width (telling the queries made
 * for `width < Npx` that changed).
 */
const stubWindowWidth = (initial: number) => {
  let width = initial;
  const queries: {
    below: number;
    listeners: Set<(event: { matches: boolean }) => void>;
  }[] = [];
  vi.stubGlobal("matchMedia", (query: string) => {
    const below = Number(/width < (\d+)px/.exec(query)?.[1]);
    const entry = {
      below,
      listeners: new Set<(e: { matches: boolean }) => void>(),
    };
    queries.push(entry);
    return {
      get matches() {
        return width < below;
      },
      addEventListener: (
        _: string,
        listener: (e: { matches: boolean }) => void,
      ) => entry.listeners.add(listener),
      removeEventListener: (
        _: string,
        listener: (e: { matches: boolean }) => void,
      ) => entry.listeners.delete(listener),
    };
  });
  return {
    queries,
    resize(next: number) {
      width = next;
      for (const { below, listeners } of queries)
        for (const listener of listeners) listener({ matches: width < below });
    },
  };
};

describe("isNarrowerThan", () => {
  it("should tell whether the window is narrower than a width", () => {
    const matchMedia = (query: string) => ({
      matches: query === "(width < 900px)",
    });
    expect(isNarrowerThan(900, matchMedia)).toBe(true);
    expect(isNarrowerThan(600, matchMedia)).toBe(false);
    expect(isNarrowerThan(undefined, matchMedia)).toBe(false);
    expect(isNarrowerThan(0, matchMedia)).toBe(false);
    expect(isNarrowerThan(900, undefined)).toBe(false);
  });
});

describe("pc-button-menu", () => {
  it("should show its actions as pill buttons, telling listeners which is chosen", async () => {
    const element = await mount<PcButtonMenu>("pc-button-menu", {
      items: ITEMS,
    });
    const selected = events<{ value: string }>(element, "pc-select");
    const buttons = queryAll<HTMLButtonElement>(element, "button");
    expect(
      buttons.map((b) => [b.textContent?.trim(), b.className, b.disabled]),
    ).toEqual([
      ["Cut", "pill cut", false],
      ["Paste", "pill paste", true],
    ]);
    element.size = "pill-s";
    await element.updateComplete;
    expect(query(element, "button.cut").classList).toContain("pill-s");
    query<HTMLButtonElement>(element, "button.cut").click();
    expect(selected).toEqual([{ value: "cut" }]);
  });

  it("should be one ⋮ menu while asked to", async () => {
    const element = await mount<PcButtonMenu>("pc-button-menu", {
      items: ITEMS,
      label: "More actions",
      menu: true,
    });
    const selected = events<{ value: string }>(element, "pc-select");
    expect(queryAll(element, "button")).toHaveLength(0);
    expect(element.showsMenu).toBe(true);
    const menu = query<PcContextMenu>(element, "pc-context-menu.more");
    expect(menu.label).toBe("More actions");
    expect(menu.items).toEqual([
      { value: "cut", label: "Cut", disabled: undefined },
      { value: "paste", label: "Paste", disabled: true },
    ]);
    const outside = vi.fn();
    document.body.addEventListener("pc-select", outside);
    menu.dispatchEvent(
      new CustomEvent("pc-select", {
        detail: { value: "cut" },
        bubbles: true,
        composed: true,
      }),
    );
    // Once, from the button menu itself
    expect(selected).toEqual([{ value: "cut" }]);
    expect(outside).toHaveBeenCalledOnce();
    document.body.removeEventListener("pc-select", outside);
  });

  it("should be one ⋮ menu while the window is narrower than menu-below", async () => {
    const window = stubWindowWidth(800);
    const element = document.createElement("pc-button-menu") as PcButtonMenu;
    element.items = ITEMS;
    element.setAttribute("menu-below", "900");
    document.body.append(element);
    await element.updateComplete;
    expect(element.showsMenu).toBe(true);
    window.resize(1000);
    await element.updateComplete;
    expect(queryAll(element, "button")).toHaveLength(2);
    window.resize(899);
    await element.updateComplete;
    expect(query(element, "pc-context-menu")).toBeTruthy();
    // A new width replaces the old one
    element.menuBelow = 600;
    await element.updateComplete;
    expect(element.showsMenu).toBe(false);
    expect(window.queries[0]!.listeners.size).toBe(0);
    element.remove();
    expect(window.queries.at(-1)!.listeners.size).toBe(0);
  });

  it("should read the width once where the window gives no events", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const element = await mount<PcButtonMenu>("pc-button-menu", {
      items: ITEMS,
      menuBelow: 900,
    });
    expect(element.showsMenu).toBe(true);
    element.remove();
  });

  it("should stay buttons without menu-below or matchMedia", async () => {
    const element = await mount<PcButtonMenu>("pc-button-menu", {
      items: ITEMS,
      menuBelow: 900,
    });
    expect(element.showsMenu).toBe(false);
    stubWindowWidth(500);
    element.menuBelow = undefined;
    await element.updateComplete;
    expect(element.showsMenu).toBe(false);
  });
});
