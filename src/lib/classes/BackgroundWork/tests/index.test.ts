import { describe, it, expect, vi, afterEach } from "vitest";
import BackgroundWork, { DRAWING_PAUSE_MS, MAX_WAIT_MS } from "..";
import StrokeLog from "../../StrokeLog";

/** Background work on fake timers, with its clock following them */
const createWork = (log?: StrokeLog) => {
  vi.useFakeTimers();
  const work = new BackgroundWork(log);
  work.now = () => Date.now();
  return work;
};

afterEach(() => vi.useRealTimers());

describe("BackgroundWork", () => {
  it("should use the performance clock by default", () => {
    expect(new BackgroundWork().now()).toBeCloseTo(performance.now(), -2);
  });

  it("should run work straight away when nobody is drawing", () => {
    const work = createWork();
    const task = vi.fn();
    work.run("map", task);
    expect(task).toHaveBeenCalledOnce();
    expect(work.pending).toEqual([]);
  });

  it("should hold work during a stroke and run it once drawing pauses", () => {
    const work = createWork();
    const task = vi.fn();
    work.strokeStarted();
    work.run("map", task);
    vi.advanceTimersByTime(100);
    expect(task).not.toHaveBeenCalled();
    expect(work.pending).toEqual(["map"]);
    work.strokeEnded();
    vi.advanceTimersByTime(DRAWING_PAUSE_MS - 1);
    expect(task).not.toHaveBeenCalled();
    // Another stroke starting holds it again
    work.strokeStarted();
    vi.advanceTimersByTime(DRAWING_PAUSE_MS);
    expect(task).not.toHaveBeenCalled();
    work.strokeEnded();
    vi.advanceTimersByTime(DRAWING_PAUSE_MS);
    expect(task).toHaveBeenCalledOnce();
  });

  it("should wait for the pause after a stroke for work asked for just after it", () => {
    const work = createWork();
    const task = vi.fn();
    work.strokeStarted();
    work.strokeEnded();
    vi.advanceTimersByTime(100);
    work.run("sync", task);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DRAWING_PAUSE_MS - 100);
    expect(task).toHaveBeenCalledOnce();
  });

  it("should run work that has waited long enough, just after the stroke ends", () => {
    const work = createWork();
    const task = vi.fn();
    work.strokeStarted();
    work.run("sync", task);
    // A long stroke: the work never runs during it
    vi.advanceTimersByTime(MAX_WAIT_MS * 2);
    work.strokeEnded();
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledOnce();
  });

  it("should run work asked for again only once, the latest request, keeping its place in the wait", () => {
    const work = createWork();
    const first = vi.fn();
    const second = vi.fn();
    work.strokeStarted();
    work.strokeEnded();
    work.run("save", first);
    vi.advanceTimersByTime(DRAWING_PAUSE_MS - 1);
    // Strokes keep coming quickly: the work waits no longer than the maximum
    for (let t = 0; t < MAX_WAIT_MS; t += 200) {
      work.strokeStarted();
      work.run("save", second);
      vi.advanceTimersByTime(100);
      work.strokeEnded();
      vi.advanceTimersByTime(100);
    }
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("should forget cancelled work", () => {
    const work = createWork();
    const sync = vi.fn();
    const map = vi.fn();
    work.strokeStarted();
    work.run("sync", sync);
    work.run("map", map);
    work.cancel("sync");
    work.strokeEnded();
    vi.advanceTimersByTime(DRAWING_PAUSE_MS);
    expect(sync).not.toHaveBeenCalled();
    expect(map).toHaveBeenCalledOnce();
  });

  it("should log how long each piece of work took", () => {
    const log = new StrokeLog();
    const work = createWork(log);
    log.now = () => Date.now();
    work.run("map", () => vi.advanceTimersByTime(5));
    expect(log.entries[0]).toMatchObject({
      kind: "work",
      detail: "map",
      measures: { ms: 5 },
    });
  });

  it("should run all the work even if some throws, then throw the first error", () => {
    const work = createWork();
    const after = vi.fn();
    work.strokeStarted();
    work.run("a", () => {
      throw new Error("a failed");
    });
    work.run("b", () => {
      throw new Error("b failed");
    });
    work.run("c", after);
    work.strokeEnded();
    expect(() => vi.advanceTimersByTime(DRAWING_PAUSE_MS)).toThrow("a failed");
    expect(after).toHaveBeenCalledOnce();
    expect(work.pending).toEqual([]);
  });
});
