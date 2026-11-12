import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { curvePath, movePoint, type PcProfileGraph } from "..";
import {
  Interpolation,
  MAX_PROFILE_POINTS,
  PROFILE_PRESETS,
  linearPoints,
  type ProfilePoint,
} from "../../../../lib/profiles";
import {
  events,
  mount,
  pointerEvent,
  query,
  queryAll,
} from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

const { Linear, BezierCubic } = Interpolation;

/** Overweight's points */
const curved = () =>
  PROFILE_PRESETS[1]!.content.points.map((point) => ({ ...point }));

/** A graph 112px square from (0, 0), so a grid unit is 10px after the 0.6 unit margin (6px) */
const setup = async (points: ProfilePoint[] = curved()) => {
  const element = await mount<PcProfileGraph>("pc-profile-graph", {
    points,
    label: "Width profile",
  });
  const svg = query(element, "svg");
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 112,
    height: 112,
  } as DOMRect);
  svg.setPointerCapture = vi.fn();
  const changes = events<{ points: ProfilePoint[] }>(element, "pc-change");
  /** Screen position of grid units */
  const at = (x: number, y: number): [number, number] => [
    x * 10 + 6,
    -y * 10 + 6,
  ];
  return { element, svg, changes, at };
};

describe("curvePath", () => {
  it("should draw the curve upside down in SVG, within the grid", () => {
    const path = curvePath(linearPoints());
    expect(path.startsWith("M0,10 L0.1,9.9")).toBe(true);
    expect(path.endsWith("L10,0")).toBe(true);
  });
});

describe("movePoint", () => {
  it("should keep a point between its neighbours, the ends at the edges, on 0.1 steps within the grid", () => {
    const points = curved();
    expect(movePoint(points, 1, 4.04, -2.96)[1]).toEqual({
      x: 4,
      y: -3,
      i: BezierCubic,
    });
    expect(movePoint(points, 1, 20, 5)[1]).toMatchObject({ x: 10, y: 0 });
    expect(movePoint(points, 0, 5, -4)[0]).toMatchObject({ x: 0, y: -4 });
    expect(movePoint(points, 2, 5, -20)[2]).toMatchObject({ x: 10, y: -10 });
  });
});

describe("pc-profile-graph", () => {
  it("should show the curve and a labelled button for each point", async () => {
    const { element } = await setup();
    expect(query(element, "svg").getAttribute("aria-label")).toBe(
      "Width profile",
    );
    expect(query(element, ".curve").getAttribute("d")).toBe(
      curvePath(curved()),
    );
    expect(
      queryAll(element, "circle.point").map((point) =>
        point.getAttribute("aria-label"),
      ),
    ).toEqual(["Point 1: 0, -10", "Point 2: 3, -3", "Point 3: 10, 0"]);
    // Nothing selected: the buttons do nothing
    expect(
      queryAll<HTMLButtonElement>(element, ".buttons button").every(
        (b) => b.disabled,
      ),
    ).toBe(true);
    element.setInterpolation(Linear);
    element.removeSelected();
    expect(element.points).toEqual(curved());
  });

  it("should start with a straight line", async () => {
    const element = await mount<PcProfileGraph>("pc-profile-graph");
    expect(element.points).toEqual(linearPoints());
    expect(query(element, "svg").hasAttribute("aria-label")).toBe(false);
  });

  it("should add a smooth point where the line is pressed, select it and drag it", async () => {
    const { element, svg, changes, at } = await setup(linearPoints());
    svg.dispatchEvent(pointerEvent("pointerdown", ...at(5, -5)));
    expect(element.points[1]).toEqual({ x: 5, y: -5, i: BezierCubic });
    expect(element.selected).toBe(1);
    svg.dispatchEvent(pointerEvent("pointermove", ...at(6, -2)));
    expect(element.points[1]).toMatchObject({ x: 6, y: -2 });
    svg.dispatchEvent(pointerEvent("pointerup", ...at(6, -2)));
    svg.dispatchEvent(pointerEvent("pointermove", ...at(2, -2)));
    expect(element.points[1]).toMatchObject({ x: 6, y: -2 });
    expect(changes).toHaveLength(2);
    expect(svg.setPointerCapture).toHaveBeenCalled();
  });

  it("should not add points away from the line, at the edges, with other buttons, or when full", async () => {
    const { element, svg, at } = await setup(linearPoints());
    svg.dispatchEvent(pointerEvent("pointerdown", ...at(5, -9)));
    svg.dispatchEvent(pointerEvent("pointerdown", ...at(0, -10)));
    svg.dispatchEvent(pointerEvent("pointerdown", ...at(5, -5), { button: 2 }));
    expect(element.points).toHaveLength(2);
    element.points = Array.from({ length: MAX_PROFILE_POINTS }, (_, i) => ({
      x: (i * 10) / (MAX_PROFILE_POINTS - 1),
      y: -10 + (i * 10) / (MAX_PROFILE_POINTS - 1),
      i: Linear,
    }));
    svg.dispatchEvent(pointerEvent("pointerdown", ...at(5, -5)));
    expect(element.points).toHaveLength(MAX_PROFILE_POINTS);
    // A zero-size graph reads presses at its corner
    vi.mocked(svg.getBoundingClientRect).mockReturnValue({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    } as DOMRect);
    element.points = linearPoints();
    svg.dispatchEvent(pointerEvent("pointerdown", 0, 0));
    expect(element.points).toHaveLength(2);
  });

  it("should select a point when pressed or focused, and move it a grid unit with the arrow keys", async () => {
    const { element, svg, at } = await setup();
    const points = () => queryAll(element, "circle.point");
    points()[2]!.dispatchEvent(pointerEvent("pointerdown", ...at(10, 0)));
    expect(element.selected).toBe(2);
    svg.dispatchEvent(pointerEvent("pointermove", ...at(8, -3)));
    expect(element.points[2]).toMatchObject({ x: 10, y: -3 });
    svg.dispatchEvent(pointerEvent("pointerup", 0, 0));
    points()[1]!.dispatchEvent(new FocusEvent("focus"));
    await element.updateComplete;
    expect(points()[1]!.getAttribute("aria-pressed")).toBe("true");
    const key = (k: string) => {
      const event = new KeyboardEvent("keydown", { key: k, cancelable: true });
      points()[1]!.dispatchEvent(event);
      return event.defaultPrevented;
    };
    key("ArrowRight");
    key("ArrowUp");
    expect(element.points[1]).toMatchObject({ x: 4, y: -2 });
    key("ArrowLeft");
    key("ArrowDown");
    expect(element.points[1]).toMatchObject({ x: 3, y: -3 });
    expect(key("a")).toBe(false);
  });

  it("should switch the selected point's interpolation, and remove it unless it's the first or last", async () => {
    const { element } = await setup();
    element.selected = 1;
    await element.updateComplete;
    const button = (name: string) =>
      query<HTMLButtonElement>(element, `button.${name}`);
    expect(button("bezier").getAttribute("aria-pressed")).toBe("true");
    button("linear").click();
    await element.updateComplete;
    expect(element.points[1]!.i).toBe(Linear);
    expect(button("linear").getAttribute("aria-pressed")).toBe("true");
    button("bezier").click();
    expect(element.points[1]!.i).toBe(BezierCubic);
    button("remove").click();
    expect(element.points).toHaveLength(2);
    expect(element.selected).toBeUndefined();
    element.selected = 0;
    await element.updateComplete;
    expect(button("remove").disabled).toBe(true);
    element.removeSelected();
    element.selected = 1;
    element.removeSelected();
    expect(element.points).toHaveLength(2);
  });
});
