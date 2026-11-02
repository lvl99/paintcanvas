import { describe, it, expect } from "vitest";
import { randomSeed, seededRandom } from "..";

describe("randomSeed", () => {
  it("should give a whole number from 0 to 2³² − 1", () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.999999999999)).toBe(0xffffffff);
    const seed = randomSeed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(
      true,
    );
  });
});

describe("seededRandom", () => {
  it("should give the same numbers for the same seed, from 0 to 1", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const numbers = Array.from({ length: 100 }, () => a());
    expect(numbers).toEqual(Array.from({ length: 100 }, () => b()));
    expect(numbers.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(seededRandom(43)()).not.toBe(numbers[0]);
  });
});
