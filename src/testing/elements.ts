import type { LitElement } from "lit";

/**
 * Create a custom element, set its properties, add it to the page and wait for it to render.
 *
 * @example
 * const button = await mount<PcButton>("pc-button", { variant: "cancel" });
 */
export const mount = async <T extends LitElement>(
  tag: string,
  properties: Partial<T> = {},
  content = "",
): Promise<T> => {
  const element = document.createElement(tag) as T;
  Object.assign(element, properties);
  element.innerHTML = content;
  document.body.append(element);
  await element.updateComplete;
  return element;
};

/**
 * Find an element in a custom element's shadow root (throws if missing).
 */
export const shadow = <T extends Element = HTMLElement>(
  host: Element,
  selector: string,
): T => {
  const found = host.shadowRoot?.querySelector<T>(selector);
  if (!found) throw new Error(`No ${selector} in ${host.tagName}`);
  return found;
};

/**
 * Collect the custom events of a type an element fires.
 */
export const events = <T = unknown>(target: EventTarget, type: string) => {
  const details: T[] = [];
  target.addEventListener(type, (event) =>
    details.push((event as CustomEvent<T>).detail),
  );
  return details;
};

/**
 * Find an element in a custom element's shadow root (throws if missing). Same as `shadow`.
 */
export const query = shadow;

/**
 * Find all matching elements in a custom element's shadow root.
 */
export const queryAll = <T extends Element = HTMLElement>(
  host: Element,
  selector: string,
): T[] => [...(host.shadowRoot?.querySelectorAll<T>(selector) ?? [])];

/**
 * Create a pointer-like event (jsdom has no PointerEvent), bubbling and cancelable.
 */
export const pointerEvent = (
  type: string,
  x: number,
  y: number,
  { pointerId = 1, ...init }: MouseEventInit & { pointerId?: number } = {},
) =>
  Object.assign(
    new MouseEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      composed: true,
      ...init,
    }),
    { pointerId },
  );

/**
 * Describe a `pc-toast` event's detail as "kind: message", to check both at once.
 *
 * @example
 * toastText({ message: "Saved", kind: "success" }); // "success: Saved"
 */
export const toastText = (
  detail: string | { message: string; kind?: string },
): string =>
  typeof detail === "string"
    ? `info: ${detail}`
    : `${detail.kind ?? "info"}: ${detail.message}`;
