/** Presses that closed a panel or menu by landing outside it */
const dismissingPresses = new WeakSet<Event>();

/**
 * Note that a press closed a panel or menu (by landing outside it), so what it landed on can treat it differently, e.g.
 * the canvas only draws once it's dragged (see `isDismissingPress`). Call it from a capturing `pointerdown` listener,
 * which runs before the listeners of what was pressed.
 *
 * @example
 * document.addEventListener("pointerdown", (event) => {
 *   if (open && !event.composedPath().includes(panel)) {
 *     markDismissingPress(event);
 *     close();
 *   }
 * }, true);
 */
export const markDismissingPress = (event: Event): void => {
  dismissingPresses.add(event);
};

/**
 * Whether a press closed a panel or menu (see `markDismissingPress`).
 *
 * @example
 * if (isDismissingPress(event)) return; // just closing something
 */
export const isDismissingPress = (event: Event): boolean =>
  dismissingPresses.has(event);
