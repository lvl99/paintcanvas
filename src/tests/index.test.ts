import { describe, expect, it } from "vitest";
import packageJson from "../../package.json" with { type: "json" };
import { VERSION } from "../index";

describe("paintcanvas", () => {
  it("exports the package version", () => {
    expect(VERSION).toBe(packageJson.version);
  });
});
