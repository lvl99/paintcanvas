import { describe, it, expect } from "vitest";
import { testPreset } from "../../../../testing/assets";
import {
  BUILT_IN_AUTHOR,
  MY_PRESETS,
  UNKNOWN_AUTHOR,
  authorGroup,
  authorHandle,
  authorName,
  groupPresetsByAuthor,
  isOwnAuthor,
} from "..";

const me = "ada.example";

describe("authorName and authorHandle", () => {
  it("should read text and detailed authors", () => {
    expect(authorName(BUILT_IN_AUTHOR)).toBe(BUILT_IN_AUTHOR);
    expect(authorName({ name: "Ann", handle: "ann.test" })).toBe("Ann");
    expect(authorName(undefined)).toBe(UNKNOWN_AUTHOR);
    expect(authorName("")).toBe(UNKNOWN_AUTHOR);
    expect(authorHandle({ name: "Ann", handle: "ann.test" })).toBe("ann.test");
    expect(authorHandle("Ann")).toBeUndefined();
  });
});

describe("isOwnAuthor", () => {
  it("should match the user's handle", () => {
    expect(isOwnAuthor({ name: "Ada", handle: me }, me)).toBe(true);
    expect(isOwnAuthor({ name: "Ann", handle: "ann.test" }, me)).toBe(false);
    expect(isOwnAuthor({ name: UNKNOWN_AUTHOR }, me)).toBe(false);
    expect(isOwnAuthor("Ada", me)).toBe(false);
  });

  it("should match the unknown author without a handle for a user without a handle", () => {
    expect(isOwnAuthor({ name: UNKNOWN_AUTHOR }, "")).toBe(true);
    expect(isOwnAuthor({ name: UNKNOWN_AUTHOR, handle: me }, "")).toBe(false);
    expect(isOwnAuthor({ name: "Ann" }, "")).toBe(false);
    expect(isOwnAuthor(UNKNOWN_AUTHOR, "")).toBe(false);
    expect(isOwnAuthor(undefined, "")).toBe(false);
  });

  it("should use the unknown author's name given", () => {
    expect(isOwnAuthor({ name: "Anonymous" }, "", "Anonymous")).toBe(true);
    expect(isOwnAuthor({ name: UNKNOWN_AUTHOR }, "", "Anonymous")).toBe(false);
  });
});

describe("authorGroup", () => {
  it("should list built-in presets under the app's name, the user's under My presets, and others by name", () => {
    expect(
      authorGroup(
        testPreset({}, { id: "round1", author: BUILT_IN_AUTHOR }),
        true,
        me,
      ),
    ).toBe(BUILT_IN_AUTHOR);
    expect(
      authorGroup(
        testPreset({}, { id: "a", author: { name: "Ada", handle: me } }),
        false,
        me,
      ),
    ).toBe(MY_PRESETS);
    expect(
      authorGroup(
        testPreset(
          {},
          { id: "b", author: { name: "Ann", handle: "ann.test" } },
        ),
        false,
        me,
      ),
    ).toBe("Ann");
    expect(
      authorGroup(
        testPreset({}, { id: "d", author: { name: UNKNOWN_AUTHOR } }),
        false,
        "",
      ),
    ).toBe(MY_PRESETS);
    // Someone naming themselves after the app isn't listed with the app's presets
    expect(
      authorGroup(
        testPreset({}, { id: "c", author: BUILT_IN_AUTHOR }),
        false,
        me,
      ),
    ).toBe(BUILT_IN_AUTHOR);
  });
});

describe("groupPresetsByAuthor", () => {
  it("should list My presets, then the app's presets, then other authors alphabetically, keeping order within groups", () => {
    const presets = [
      testPreset({}, { id: "zed", author: "Zed" }),
      testPreset({}, { id: "mine2", author: { name: "Ada", handle: me } }),
      testPreset({}, { id: "round1", author: BUILT_IN_AUTHOR }),
      testPreset(
        {},
        { id: "ann", author: { name: "Ann", handle: "ann.test" } },
      ),
      testPreset({}, { id: "mine1", author: { name: "Ada", handle: me } }),
      testPreset({}, { id: "round5", author: BUILT_IN_AUTHOR }),
    ];
    const groups = groupPresetsByAuthor(
      presets,
      (id) => id.startsWith("round"),
      me,
    );
    expect(
      groups.map((group) => [group.label, group.presets.map((p) => p.id)]),
    ).toEqual([
      [MY_PRESETS, ["mine2", "mine1"]],
      [BUILT_IN_AUTHOR, ["round1", "round5"]],
      ["Ann", ["ann"]],
      ["Zed", ["zed"]],
    ]);
  });

  it("should head the presets that come with the app with the app's name when given", () => {
    const groups = groupPresetsByAuthor(
      [
        testPreset({}, { id: "zed", author: "Zed" }),
        testPreset({}, { id: "round1", author: BUILT_IN_AUTHOR }),
      ],
      (id) => id.startsWith("round"),
      me,
      { builtIn: "My App" },
    );
    expect(groups.map((group) => group.label)).toEqual(["My App", "Zed"]);
  });
});
