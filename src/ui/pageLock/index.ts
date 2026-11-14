/** Overflow values that let an element scroll */
const SCROLLING = /auto|scroll|overlay/;

/**
 * Whether an event target is a form field, which handles its own touches.
 */
const isFormControl = (target: EventTarget | undefined): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

/**
 * Whether an element can scroll further by a distance (positive: right or down), along one axis.
 *
 * @example
 * canScrollBy(panel, 0, 10); // true while the panel isn't scrolled to the bottom
 */
export const canScrollBy = (
  element: Element,
  deltaX: number,
  deltaY: number,
): boolean => {
  const style = getComputedStyle(element);
  const can = (
    overflow: string,
    delta: number,
    position: number,
    size: number,
    client: number,
  ) =>
    delta !== 0 &&
    SCROLLING.test(overflow) &&
    size > client &&
    (delta < 0 ? position > 0 : position + client < size - 1);
  return (
    can(
      style.overflowX,
      deltaX,
      element.scrollLeft,
      element.scrollWidth,
      element.clientWidth,
    ) ||
    can(
      style.overflowY,
      deltaY,
      element.scrollTop,
      element.scrollHeight,
      element.clientHeight,
    )
  );
};

/**
 * Whether something on an event's path, before `boundary`, can scroll by a distance, i.e. the event scrolls it rather
 * than the page.
 *
 * @example
 * scrollsWithin(event.composedPath(), layout, 0, event.deltaY);
 */
export const scrollsWithin = (
  path: readonly EventTarget[],
  boundary: Element,
  deltaX: number,
  deltaY: number,
): boolean => {
  for (const target of path) {
    if (target === boundary) return false;
    if (target instanceof Element && canScrollBy(target, deltaX, deltaY))
      return true;
  }
  return false;
};

/**
 * Stop the page from scrolling or zooming while it's used inside an element (e.g. the drawing app): wheel and touch
 * scrolling only scroll what can scroll inside it (e.g. a panel), and pinches, Cmd/Ctrl + scroll and Safari's gesture
 * events don't zoom the page. Pair with `touch-action: none` on the element, which stops touches starting on it from
 * scrolling the page or zooming it with a pinch or double tap. Keyboard zoom (Cmd/Ctrl + plus and minus) isn't
 * stopped, so the page can still be zoomed. Returns a function that stops it.
 *
 * @example
 * const unlock = lockPage(layout);
 * unlock();
 */
export const lockPage = (element: HTMLElement): (() => void) => {
  let lastTouch: { x: number; y: number } | undefined;
  const onWheel = (event: WheelEvent) => {
    if (
      event.ctrlKey ||
      !scrollsWithin(event.composedPath(), element, event.deltaX, event.deltaY)
    )
      event.preventDefault();
  };
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch) lastTouch = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    const from = lastTouch ?? { x: touch.clientX, y: touch.clientY };
    lastTouch = { x: touch.clientX, y: touch.clientY };
    // Content moves with the finger, so it scrolls the other way
    const deltaX = from.x - touch.clientX;
    const deltaY = from.y - touch.clientY;
    const single = event.touches.length === 1;
    // Not moved yet, or a form control's own drag (e.g. a range slider)
    if (single && deltaX === 0 && deltaY === 0) return;
    if (single && isFormControl(event.composedPath()[0])) return;
    if (
      event.cancelable &&
      (event.touches.length > 1 ||
        !scrollsWithin(event.composedPath(), element, deltaX, deltaY))
    )
      event.preventDefault();
  };
  const onGesture = (event: Event) => event.preventDefault();
  const listeners: [string, EventListener][] = [
    ["wheel", onWheel as EventListener],
    ["touchstart", onTouchStart as EventListener],
    ["touchmove", onTouchMove as EventListener],
    ["gesturestart", onGesture],
    ["gesturechange", onGesture],
  ];
  for (const [type, listener] of listeners)
    element.addEventListener(type, listener, { passive: false });
  return () => {
    for (const [type, listener] of listeners)
      element.removeEventListener(type, listener);
  };
};
