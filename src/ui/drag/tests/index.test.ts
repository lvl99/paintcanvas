import { describe, it, expect, vi } from "vitest";
import { DRAG_THRESHOLD, PointerDrag, dragDelta } from "..";

/** A pointer-like event on an element (jsdom has no PointerEvent) */
const pointer = (
  type: string,
  clientX: number,
  clientY: number,
  currentTarget: Element = document.createElement("div"),
) => {
  const event = new MouseEvent(type, { clientX, clientY, cancelable: true });
  Object.defineProperty(event, "currentTarget", { value: currentTarget });
  return Object.assign(event, { pointerId: 3 }) as unknown as PointerEvent;
};

describe("dragDelta", () => {
  it("should count right and up as positive, left and down as negative", () => {
    expect(dragDelta({ x: 0, y: 0 }, { x: 5, y: -5 })).toBe(10);
    expect(dragDelta({ x: 0, y: 0 }, { x: -2, y: 3 })).toBe(-5);
    expect(dragDelta({ x: 4, y: 4 }, { x: 6, y: 6 })).toBe(0);
  });
});

describe("PointerDrag", () => {
  it("should give deltas while pressed, without a threshold", () => {
    const onDelta = vi.fn();
    const drag = new PointerDrag(onDelta);
    drag.move(pointer("pointermove", 10, 0));
    expect(onDelta).not.toHaveBeenCalled();
    drag.start(pointer("pointerdown", 0, 0));
    expect(drag.dragging).toBe(true);
    drag.move(pointer("pointermove", 1, 0));
    drag.move(pointer("pointermove", 1, 0));
    drag.move(pointer("pointermove", 0, 2));
    expect(onDelta.mock.calls).toEqual([[1], [-3]]);
    expect(drag.end()).toBe(true);
    drag.move(pointer("pointermove", 50, 0));
    expect(onDelta).toHaveBeenCalledTimes(2);
  });

  it("should only start dragging once the pointer moves past the threshold", () => {
    const onDelta = vi.fn();
    const drag = new PointerDrag(onDelta, DRAG_THRESHOLD);
    drag.start(pointer("pointerdown", 0, 0));
    drag.move(pointer("pointermove", 2, -2));
    expect(drag.dragging).toBe(false);
    expect(onDelta).not.toHaveBeenCalled();
    // A press that barely moved is not a drag
    expect(drag.end()).toBe(false);

    drag.start(pointer("pointerdown", 0, 0));
    const past = pointer("pointermove", 4, 0);
    drag.move(past);
    expect(past.defaultPrevented).toBe(true);
    // The whole distance from the press counts
    expect(onDelta).toHaveBeenCalledWith(4);
    drag.move(pointer("pointermove", 4, -1));
    expect(onDelta).toHaveBeenLastCalledWith(1);
    expect(drag.end()).toBe(true);
  });

  it("should capture the pointer when the element supports it", () => {
    const element = document.createElement("div");
    const capture = vi.fn();
    Object.assign(element, { setPointerCapture: capture });
    new PointerDrag(vi.fn()).start(pointer("pointerdown", 0, 0, element));
    expect(capture).toHaveBeenCalledWith(3);
  });
});
