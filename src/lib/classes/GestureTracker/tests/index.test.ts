import { describe, it, expect } from "vitest";
import GestureTracker, {
  SWIPE_MIN_PX,
  TAP_MAX_MS,
  TAP_SLOP_PX,
  swipeOf,
} from "..";

const row = (x: number, y = 0) => [
  { x, y },
  { x: x + 20, y },
  { x: x + 40, y },
];

describe("swipeOf", () => {
  it("should find the direction three fingers moved together", () => {
    const from = row(100, 100);
    expect(swipeOf(from, row(100 + SWIPE_MIN_PX, 100))).toBe("swipeRight3");
    expect(swipeOf(from, row(100 - SWIPE_MIN_PX, 100))).toBe("swipeLeft3");
    expect(swipeOf(from, row(100, 100 + SWIPE_MIN_PX))).toBe("swipeDown3");
    expect(swipeOf(from, row(100, 100 - SWIPE_MIN_PX))).toBe("swipeUp3");
    expect(swipeOf(from, row(110, 100))).toBeUndefined();
  });

  it("should find fingers spreading apart or closing together", () => {
    const close = [
      { x: 90, y: 100 },
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    const wide = [
      { x: 20, y: 100 },
      { x: 100, y: 100 },
      { x: 180, y: 100 },
    ];
    expect(swipeOf(close, wide)).toBe("swipeOut3");
    expect(swipeOf(wide, close)).toBe("swipeIn3");
    // A little spreading isn't a swipe
    expect(
      swipeOf(close, [
        { x: 85, y: 100 },
        { x: 100, y: 100 },
        { x: 115, y: 100 },
      ]),
    ).toBeUndefined();
  });
});

describe("GestureTracker", () => {
  /** Put fingers down at a row of points, at a time */
  const press = (
    tracker: GestureTracker,
    points: { x: number; y: number }[],
    time = 0,
  ) => points.forEach((point, i) => tracker.down(i + 1, point, time));

  it("should recognise two- and three-finger taps", () => {
    const tracker = new GestureTracker();
    press(tracker, row(0).slice(0, 2));
    expect(tracker.count).toBe(2);
    expect(tracker.up(1, 100)).toBeUndefined();
    expect(tracker.up(2, 150)).toBe("tap2");
    press(tracker, row(0), 1000);
    tracker.move(1, { x: TAP_SLOP_PX, y: 0 });
    expect(tracker.dragging).toBe(false);
    tracker.up(1, 1100);
    tracker.up(2, 1100);
    expect(tracker.up(3, 1100)).toBe("tap3");
  });

  it("should not tap when too slow, a finger moved, or with one or four fingers", () => {
    const tracker = new GestureTracker();
    press(tracker, row(0).slice(0, 2));
    tracker.up(1, TAP_MAX_MS + 1);
    expect(tracker.up(2, TAP_MAX_MS + 1)).toBeUndefined();
    press(tracker, row(0).slice(0, 2), 1000);
    tracker.move(2, { x: 20 + TAP_SLOP_PX + 1, y: 0 });
    tracker.move(9, { x: 0, y: 0 });
    expect(tracker.dragging).toBe(true);
    tracker.up(1, 1100);
    expect(tracker.up(2, 1100)).toBeUndefined();
    press(tracker, row(0).slice(0, 1), 2000);
    expect(tracker.up(1, 2050)).toBeUndefined();
    press(tracker, [...row(0), { x: 80, y: 0 }], 3000);
    for (const id of [1, 2, 3]) tracker.up(id, 3050);
    expect(tracker.up(4, 3050)).toBeUndefined();
    // Unknown fingers are ignored
    expect(tracker.up(9, 3100)).toBeUndefined();
  });

  it("should recognise three-finger swipes, measured until the first finger lifts", () => {
    const tracker = new GestureTracker();
    press(tracker, row(100));
    row(100 - SWIPE_MIN_PX).forEach((point, i) => tracker.move(i + 1, point));
    tracker.up(1, 400);
    // Later movement doesn't count
    tracker.move(2, { x: 500, y: 500 });
    tracker.up(2, 400);
    expect(tracker.up(3, 400)).toBe("swipeLeft3");
  });

  it("should tap with three fingers that barely moved, but not when they moved without swiping", () => {
    const tracker = new GestureTracker();
    press(tracker, row(100));
    row(100 + SWIPE_MIN_PX / 2).forEach((point, i) =>
      tracker.move(i + 1, point),
    );
    for (const id of [1, 2]) tracker.up(id, 100);
    expect(tracker.up(3, 100)).toBeUndefined();
  });

  it("should make no gesture once a touch is cancelled", () => {
    const tracker = new GestureTracker();
    press(tracker, row(0).slice(0, 2));
    tracker.cancel(1);
    tracker.cancel(9);
    expect(tracker.up(2, 50)).toBeUndefined();
    // The next gesture starts afresh
    press(tracker, row(0).slice(0, 2), 1000);
    tracker.up(1, 1050);
    expect(tracker.up(2, 1050)).toBe("tap2");
  });
});
