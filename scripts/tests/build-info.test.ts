import { describe, it, expect } from "vitest";
import { UNKNOWN_COMMIT, buildInfo, commitHash } from "../build-info.ts";

describe("build info", () => {
  it("should read the commit's short hash, or say it's unknown", () => {
    expect(commitHash()).toMatch(/^[0-9a-f]{7,}$/);
    expect(commitHash(() => "abc1234\n")).toBe("abc1234");
    expect(commitHash(() => "")).toBe(UNKNOWN_COMMIT);
    expect(
      commitHash(() => {
        throw new Error("Not a git repository");
      }),
    ).toBe(UNKNOWN_COMMIT);
  });

  it("should define the commit for Vite", () => {
    const config = (
      buildInfo().config as () => { define: Record<string, string> }
    )();
    expect(config.define).toEqual({
      __PAINTCANVAS_COMMIT__: JSON.stringify(commitHash()),
    });
  });
});
