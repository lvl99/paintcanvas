/** A random number generator returning numbers from 0 (inclusive) to 1 (exclusive), like `Math.random` */
export type RandomFn = () => number;

/**
 * A random whole number from 0 to 2³² − 1, e.g. a seed for `seededRandom`.
 *
 * @example
 * randomSeed(); // 3141592653
 */
export const randomSeed = (random: RandomFn = Math.random): number =>
  Math.floor(random() * 0x100000000);

/**
 * A random number generator that always gives the same numbers for the same seed (mulberry32), so random variation can
 * be repeated, e.g. to draw a received stroke the same way.
 *
 * @example
 * const random = seededRandom(42);
 * random(); // 0.6011037519201636, every time
 */
export const seededRandom = (seed: number): RandomFn => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
};
