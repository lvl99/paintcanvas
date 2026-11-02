import { describe, it, expect } from "vitest";
import { queryAll, toastText } from "../elements";

describe("toastText", () => {
  it("should describe toasts given as text or as a message and kind", () => {
    expect(toastText("Saved")).toBe("info: Saved");
    expect(toastText({ message: "Saved" })).toBe("info: Saved");
    expect(toastText({ message: "Failed", kind: "error" })).toBe(
      "error: Failed",
    );
  });
});

describe("queryAll", () => {
  it("should find nothing in an element without a shadow root", () => {
    expect(queryAll(document.createElement("div"), "p")).toEqual([]);
  });
});
