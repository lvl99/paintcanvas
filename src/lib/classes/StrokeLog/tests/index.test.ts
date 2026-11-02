import { describe, it, expect, vi } from "vitest";
import StrokeLog, {
  DEFAULT_STROKE_LOG_LIMIT,
  STROKE_LOG_COLUMNS,
  csvField,
  strokeLogCsv,
} from "..";

/** A log whose clock reads `time.now` */
const createLog = (limit?: number) => {
  const log = new StrokeLog(limit);
  const time = { now: 0 };
  log.now = () => time.now;
  return { log, time };
};

describe("StrokeLog", () => {
  it("should keep the default number of entries and use the performance clock", () => {
    const log = new StrokeLog();
    expect(log.limit).toBe(DEFAULT_STROKE_LOG_LIMIT);
    expect(log.now()).toBeCloseTo(performance.now(), -2);
  });

  it("should log a stroke's start and end with its measurements", () => {
    const { log, time } = createLog();
    const changed = vi.fn();
    log.addEventListener("change", changed);

    // Pressed at 100, handled at 105 (the page was busy), starting took 2ms
    time.now = 107;
    log.begin("pen", 100, 2);
    expect(log.drawing).toBe(true);
    expect(log.entries[0]).toMatchObject({
      kind: "start",
      detail: "pen",
      measures: { wait: 5 },
    });
    // Moved at 110, handled at 120.25 taking 0.25ms; moved at 130, handled at 131 taking 1ms
    time.now = 120.5;
    log.move(110, 0.25);
    time.now = 132;
    log.move(130, 1);
    log.frame(4);
    time.now = 150;
    log.frame(9);
    log.overlay();
    log.overlay();
    time.now = 210;
    log.end(200, 3);
    expect(log.drawing).toBe(false);
    expect(log.entries[1]).toMatchObject({
      kind: "end",
      detail: "pen",
      measures: {
        wait: 5,
        begin: 2,
        moves: 2,
        maxMoveWait: 10.3,
        moveMs: 1.3,
        frames: 2,
        maxFrame: 9,
        // From the start (handled at 105) to the first frame at 132, and from the last frame at 150 to the end at 210
        maxFrameGap: 60,
        overlays: 2,
        end: 3,
        duration: 100,
      },
    });
    expect(log.entries[1]!.measures).not.toHaveProperty("gap");
    expect(changed).toHaveBeenCalledTimes(2);

    // The next stroke measures the gap since the last one ended
    time.now = 260;
    log.begin("pen", 250, 0);
    expect(log.entries[2]!.measures).toEqual({ wait: 10, gap: 50 });
    log.end(300, 0);
    expect(log.entries[3]!.measures).toMatchObject({ gap: 50, duration: 50 });
  });

  it("should log a cancelled stroke with why and its measurements so far", () => {
    const { log, time } = createLog();
    log.cancel("nothing to cancel");
    expect(log.entries).toHaveLength(0);
    log.begin("touch", 0, 0);
    time.now = 40;
    log.cancel("a second finger touched");
    expect(log.entries[1]).toMatchObject({
      kind: "cancel",
      detail: "touch: a second finger touched",
      measures: { duration: 40, moves: 0 },
    });
    expect(log.drawing).toBe(false);
    // Cancelling counts as the end for the next stroke's gap
    time.now = 100;
    log.begin("touch", 100, 0);
    expect(log.entries[2]!.measures).toMatchObject({ gap: 60 });
  });

  it("should ignore moves, frames and ends without a stroke", () => {
    const { log } = createLog();
    log.move(0, 1);
    log.frame(1);
    log.overlay();
    log.end(0, 1);
    expect(log.entries).toHaveLength(0);
  });

  it("should log ignored presses, gestures and other work", async () => {
    const { log, time } = createLog();
    log.ignore("mouse", "button 2");
    log.gesture("tap2", "undo");
    log.work("sync", { ms: 12.345 });
    const result = log.measure("map", () => {
      time.now += 7;
      return "drawn";
    });
    expect(result).toBe("drawn");
    // Work that finishes later is logged once it settles, whether it succeeds or fails
    const saved = log.measure("save", () => Promise.resolve());
    const failed = log.measure("send", () => Promise.reject(new Error("x")));
    time.now += 20;
    await saved;
    await failed.catch(() => undefined);
    expect(
      log.entries.map(({ kind, detail, measures }) => [kind, detail, measures]),
    ).toEqual([
      ["ignore", "mouse: button 2", {}],
      ["gesture", "tap2: undo", {}],
      ["work", "sync", { ms: 12.3 }],
      ["work", "map", { ms: 7 }],
      ["work", "save", { total: 20 }],
      ["work", "send", { total: 20 }],
    ]);
    expect(log.entries[0]!.at).toBeCloseTo(Date.now(), -3);
  });

  it("should record nothing while switched off, still running measured work", () => {
    const { log } = createLog();
    log.enabled = false;
    log.begin("pen", 0, 0);
    log.move(1, 1);
    log.frame(1);
    log.end(2, 1);
    log.cancel("x");
    log.ignore("touch", "x");
    log.gesture("tap2", "undo");
    log.work("sync", { ms: 1 });
    expect(log.measure("map", () => "drawn")).toBe("drawn");
    expect(log.entries).toHaveLength(0);
    expect(log.drawing).toBe(false);
  });

  it("should keep only the most recent entries, and clear them", () => {
    const { log } = createLog(2);
    const changed = vi.fn();
    log.addEventListener("change", changed);
    log.work("a", {});
    log.work("b", {});
    log.work("c", {});
    expect(log.entries.map((entry) => entry.detail)).toEqual(["b", "c"]);
    log.clear();
    expect(log.entries).toHaveLength(0);
    expect(changed).toHaveBeenCalledTimes(4);
  });
});

describe("csvField", () => {
  it("should quote fields with commas, quotes or line breaks", () => {
    expect(csvField("pen")).toBe("pen");
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
});

describe("strokeLogCsv", () => {
  it("should list the context, a header and one row per entry with a column per measurement", () => {
    const { log, time } = createLog();
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 31, 20, 0, 0, 5));
    time.now = 3;
    log.begin("pen", 0, 1, { layers: 3, zoomPct: 50 });
    log.end(40, 2);
    log.ignore("touch", "focus pen mode: the pen is down, again");
    log.work("map", { ms: 4 });
    vi.restoreAllMocks();
    const lines = strokeLogCsv(log.entries, {
      version: "1.13.0",
      canvas: "2000x2000",
    }).split("\n");
    expect(lines[0]).toBe("# version: 1.13.0");
    expect(lines[1]).toBe("# canvas: 2000x2000");
    expect(lines[2]).toBe(
      ["time", "event", "detail", ...STROKE_LOG_COLUMNS].join(","),
    );
    const row = (line: string) =>
      Object.fromEntries(
        ["time", "event", "detail", ...STROKE_LOG_COLUMNS].map((name, i) => [
          name,
          line.split(",")[i],
        ]),
      );
    expect(row(lines[3]!)).toMatchObject({
      time: "2026-10-31T20:00:00.005Z",
      event: "start",
      detail: "pen",
      wait: "2",
      layers: "3",
      zoomPct: "50",
      duration: "",
    });
    expect(row(lines[4]!)).toMatchObject({
      event: "end",
      begin: "1",
      end: "2",
      duration: "40",
      layers: "3",
    });
    expect(lines[5]).toContain(
      ',ignore,"touch: focus pen mode: the pen is down, again",',
    );
    expect(lines[6]!.endsWith(",4,")).toBe(true);
    expect(strokeLogCsv([])).toBe(
      ["time", "event", "detail", ...STROKE_LOG_COLUMNS].join(","),
    );
  });
});
