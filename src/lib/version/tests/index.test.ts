import { describe, it, expect } from "vitest";
import packageJson from "../../../../package.json";
import {
  PAINTCANVAS_COMMIT,
  PAINTCANVAS_REPOSITORY_URL,
  PAINTCANVAS_VERSION,
  UNKNOWN_COMMIT,
  readCommit,
  versionText,
} from "..";

describe("version", () => {
  it("should be the package's version and the commit it was built from", () => {
    expect(PAINTCANVAS_VERSION).toBe(packageJson.version);
    expect(PAINTCANVAS_COMMIT).toMatch(/^([0-9a-f]{7,}|unknown)$/);
    expect(PAINTCANVAS_REPOSITORY_URL).toBe(
      "https://github.com/lvl99/paintcanvas",
    );
  });

  it("should name PaintCanvas with its version and commit", () => {
    expect(versionText()).toBe(
      `PaintCanvas v${PAINTCANVAS_VERSION} (${PAINTCANVAS_COMMIT})`,
    );
    expect(versionText("1.0.0", "abc1234")).toBe(
      "PaintCanvas v1.0.0 (abc1234)",
    );
  });
});

describe("readCommit", () => {
  it("should read the commit, or say it's unknown when it wasn't put in place", () => {
    expect(readCommit(() => "abc1234")).toBe("abc1234");
    expect(readCommit(() => "")).toBe(UNKNOWN_COMMIT);
    expect(readCommit(() => undefined)).toBe(UNKNOWN_COMMIT);
    expect(
      readCommit(() => {
        throw new ReferenceError("__PAINTCANVAS_COMMIT__ is not defined");
      }),
    ).toBe(UNKNOWN_COMMIT);
  });
});
