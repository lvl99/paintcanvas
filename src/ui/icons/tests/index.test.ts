import { describe, it, expect, vi } from "vitest";
import { DEFAULT_ICONS, IconRegistry, icons } from "..";

describe("IconRegistry", () => {
  it("should start with the icons that come with PaintCanvas", () => {
    const registry = new IconRegistry();
    expect(registry.get("brush")).toBe(DEFAULT_ICONS.brush);
    expect(registry.names).toEqual(Object.keys(DEFAULT_ICONS));
    expect(registry.get("missing")).toBeUndefined();
    expect(icons).toBeInstanceOf(IconRegistry);
  });

  it("should replace and add icons, and put the defaults back, telling listeners", () => {
    const registry = new IconRegistry();
    const listener = vi.fn();
    registry.addEventListener("change", listener);
    registry.register({ brush: "/brush.svg", sparkle: "/sparkle.svg" });
    expect([registry.get("brush"), registry.get("sparkle")]).toEqual([
      "/brush.svg",
      "/sparkle.svg",
    ]);
    registry.reset();
    expect([registry.get("brush"), registry.get("sparkle")]).toEqual([
      DEFAULT_ICONS.brush,
      undefined,
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should start with the given icons", () => {
    expect(new IconRegistry({ a: "/a.png" }).names).toEqual(["a"]);
  });
});
