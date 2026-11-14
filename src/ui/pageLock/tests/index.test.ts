import { describe, it, expect, afterEach } from "vitest";
import { canScrollBy, lockPage, scrollsWithin } from "..";

afterEach(() => document.body.replaceChildren());

/** An element that scrolls (jsdom has no layout, so its sizes are given) */
const scroller = (
  { top = 0, left = 0 } = {},
  overflow = "auto",
): HTMLElement => {
  const element = document.createElement("div");
  element.style.overflowX = overflow;
  element.style.overflowY = overflow;
  const sizes = {
    scrollHeight: 200,
    clientHeight: 100,
    scrollWidth: 200,
    clientWidth: 100,
    scrollTop: top,
    scrollLeft: left,
  };
  for (const [name, value] of Object.entries(sizes))
    Object.defineProperty(element, name, { value });
  return element;
};

/** A layout with a scrolling panel in it, locked */
const setup = () => {
  const layout = document.createElement("div");
  const panel = scroller();
  const bar = document.createElement("div");
  layout.append(panel, bar);
  document.body.append(layout);
  const unlock = lockPage(layout);
  return { layout, panel, bar, unlock };
};

/** Fire a touch event (jsdom has no Touch, so touches are plain objects) */
const touch = (
  target: Element,
  type: string,
  points: { x: number; y: number }[],
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: points.map(({ x, y }) => ({ clientX: x, clientY: y })),
  });
  target.dispatchEvent(event);
  return event;
};

describe("canScrollBy", () => {
  it("should be true only towards an end it isn't at", () => {
    const top = scroller();
    expect(canScrollBy(top, 0, 10)).toBe(true);
    expect(canScrollBy(top, 0, -10)).toBe(false);
    const bottom = scroller({ top: 100, left: 100 });
    expect(canScrollBy(bottom, 0, 10)).toBe(false);
    expect(canScrollBy(bottom, 0, -10)).toBe(true);
    expect(canScrollBy(bottom, -10, 0)).toBe(true);
    expect(canScrollBy(top, 0, 0)).toBe(false);
  });

  it("should be false for an element that doesn't scroll", () => {
    expect(canScrollBy(scroller({}, "hidden"), 0, 10)).toBe(false);
  });
});

describe("scrollsWithin", () => {
  it("should look only at targets before the boundary", () => {
    const panel = scroller();
    const boundary = document.createElement("div");
    expect(scrollsWithin([panel, boundary], boundary, 0, 10)).toBe(true);
    expect(scrollsWithin([boundary, panel], boundary, 0, 10)).toBe(false);
    expect(scrollsWithin([window], boundary, 0, 10)).toBe(false);
  });
});

describe("lockPage", () => {
  it("should only let the wheel scroll what scrolls inside, and never zoom", () => {
    const { panel, bar } = setup();
    const wheel = (target: Element, init: WheelEventInit) => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(wheel(panel, { deltaY: 10 })).toBe(false);
    expect(wheel(panel, { deltaY: -10 })).toBe(true);
    expect(wheel(bar, { deltaY: 10 })).toBe(true);
    expect(wheel(panel, { deltaY: 10, ctrlKey: true })).toBe(true);
  });

  it("should only let touches scroll what scrolls inside, and never pinch", () => {
    const { panel, bar } = setup();
    touch(panel, "touchstart", [{ x: 0, y: 50 }]);
    // Not moved yet
    expect(touch(panel, "touchmove", [{ x: 0, y: 50 }]).defaultPrevented).toBe(
      false,
    );
    // Dragging up scrolls down
    expect(touch(panel, "touchmove", [{ x: 0, y: 40 }]).defaultPrevented).toBe(
      false,
    );
    expect(touch(panel, "touchmove", [{ x: 0, y: 60 }]).defaultPrevented).toBe(
      true,
    );
    touch(bar, "touchstart", [{ x: 0, y: 50 }]);
    expect(touch(bar, "touchmove", [{ x: 0, y: 40 }]).defaultPrevented).toBe(
      true,
    );
    // Two fingers
    expect(
      touch(panel, "touchmove", [
        { x: 0, y: 40 },
        { x: 10, y: 10 },
      ]).defaultPrevented,
    ).toBe(true);
  });

  it("should ignore touch events without touches, and moves without a start", () => {
    const { panel } = setup();
    expect(touch(panel, "touchstart", []).defaultPrevented).toBe(false);
    expect(touch(panel, "touchmove", []).defaultPrevented).toBe(false);
    // The first move counts as not moved yet
    expect(touch(panel, "touchmove", [{ x: 0, y: 0 }]).defaultPrevented).toBe(
      false,
    );
  });

  it("should leave form fields' own drags alone", () => {
    const { layout } = setup();
    const range = document.createElement("input");
    range.type = "range";
    layout.append(range);
    touch(range, "touchstart", [{ x: 0, y: 0 }]);
    expect(touch(range, "touchmove", [{ x: 10, y: 0 }]).defaultPrevented).toBe(
      false,
    );
  });

  it("should stop Safari's gesture zoom, until unlocked", () => {
    const { layout, unlock } = setup();
    const gesture = () => {
      const event = new Event("gesturestart", { cancelable: true });
      layout.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(gesture()).toBe(true);
    unlock();
    expect(gesture()).toBe(false);
  });

  it("should not stop touches that can no longer be cancelled", () => {
    const { bar } = setup();
    touch(bar, "touchstart", [{ x: 0, y: 50 }]);
    const event = new Event("touchmove", { bubbles: true, cancelable: false });
    Object.defineProperty(event, "touches", {
      value: [{ clientX: 0, clientY: 40 }],
    });
    bar.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
