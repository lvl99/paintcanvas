import { describe, it, expect } from "vitest";
import { isDismissingPress, markDismissingPress } from "..";

describe("markDismissingPress", () => {
  it("should mark only the presses that closed something", () => {
    const closing = new Event("pointerdown");
    const other = new Event("pointerdown");
    markDismissingPress(closing);
    expect(isDismissingPress(closing)).toBe(true);
    expect(isDismissingPress(other)).toBe(false);
  });
});
