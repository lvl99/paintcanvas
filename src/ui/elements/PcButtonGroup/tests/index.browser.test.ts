import { afterEach, describe, it, expect } from "vitest";
import "..";
import "../../PcButton";
import type { PcButtonGroup } from "..";

afterEach(() => document.body.replaceChildren());

/** A joined group of buttons, and each button's corners */
const corners = async (labels: string[], orientation = "horizontal") => {
  const group = document.createElement("pc-button-group") as PcButtonGroup;
  group.joined = true;
  group.orientation = orientation as PcButtonGroup["orientation"];
  group.innerHTML = labels
    .map((label) => `<pc-button>${label}</pc-button>`)
    .join("");
  document.body.append(group);
  await group.updateComplete;
  const buttons = [...group.querySelectorAll("pc-button")];
  await Promise.all(
    buttons.map((button) => (button as PcButtonGroup).updateComplete),
  );
  return {
    radii: buttons.map((button) => {
      const style = getComputedStyle(
        button.shadowRoot!.querySelector("button")!,
      );
      return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ].map((radius) => (radius === "0px" ? 0 : 1));
    }),
    edges: buttons.map((button) => {
      const { left, right } = button.getBoundingClientRect();
      return [Math.round(left), Math.round(right)] as const;
    }),
  };
};

describe("pc-button-group in a real browser", () => {
  it("should round only the outer ends of joined buttons, with no gaps between them", async () => {
    const { radii, edges } = await corners(["Day", "Week", "Month"]);
    expect(radii).toEqual([
      [1, 0, 0, 1],
      [0, 0, 0, 0],
      [0, 1, 1, 0],
    ]);
    // Each button starts 1px before the one before ends, so they share a border
    for (let i = 1; i < edges.length; i++)
      expect(edges[i]![0]).toBe(edges[i - 1]![1] - 1);
    document.body.replaceChildren();
    expect((await corners(["Day"])).radii).toEqual([[1, 1, 1, 1]]);
  });

  it("should round the top and bottom ends of a joined column", async () => {
    const { radii } = await corners(["Top", "Middle", "Bottom"], "vertical");
    expect(radii).toEqual([
      [1, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 1, 1],
    ]);
  });
});
