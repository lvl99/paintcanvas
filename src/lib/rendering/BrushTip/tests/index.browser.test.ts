import { describe, it, expect, vi, afterEach } from "vitest";
import BrushTip from "..";
import { brushPresets } from "../../../brushes";

afterEach(() => vi.unstubAllGlobals());

describe("brush shapes in a real browser", () => {
  it("should load every preset's shape when fetch is blocked, as the site's Content Security Policy blocks data: URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const shaped = Object.values(brushPresets).filter(
      (preset) => typeof preset.content.image === "string",
    );
    expect(shaped.length).toBeGreaterThan(0);
    for (const preset of shaped) {
      const tip = await BrushTip.load(preset.content);
      expect(tip.mask, preset.id).toBeDefined();
    }
  });
});
