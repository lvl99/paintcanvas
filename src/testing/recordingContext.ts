import type { DrawingContext } from "../lib/rendering/compositing";

/** A recorded drawing call or property change */
export type Recorded = [name: string, ...args: unknown[]];

/**
 * Create a fake 2D context that records every method call and property assignment, in order.
 */
export const createRecordingContext = () => {
  const calls: Recorded[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get: (target, name: string) =>
      name in target
        ? target[name]
        : (...args: unknown[]) => void calls.push([name, ...args]),
    set: (target, name: string, value) => {
      target[name] = value;
      calls.push([`set:${name}`, value]);
      return true;
    },
  });
  return { ctx: ctx as unknown as DrawingContext, calls };
};
