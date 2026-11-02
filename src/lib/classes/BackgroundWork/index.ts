import type StrokeLog from "../StrokeLog";

/** How long drawing must pause after a stroke before background work runs (milliseconds) */
export const DRAWING_PAUSE_MS = 300;

/** Longest background work waits while drawing continues (milliseconds); it still only runs between strokes */
export const MAX_WAIT_MS = 1_000;

/** Work waiting to run, and when it was first asked for */
interface Task {
  run: () => unknown;
  since: number;
}

/**
 * Holds slow work that isn't urgent (syncing the drawing, redrawing the canvas map and layer thumbnails, saving) until
 * drawing pauses, so it doesn't keep the page busy while the user is drawing or about to draw the next stroke.
 *
 * Work never runs during a stroke. Between strokes, it runs once `DRAWING_PAUSE_MS` has passed since the last stroke
 * ended, or once it has waited `MAX_WAIT_MS` (so a long run of strokes doesn't hold it up forever).
 * When nobody is drawing, it runs straight away (during `run`); work due when a stroke ends runs just after it. Work
 * asked for again under the same name before it runs replaces the earlier request (keeping its place in the wait). With
 * a stroke log, how long each piece of work took is logged.
 *
 * @example
 * const work = new BackgroundWork(app.strokeLog);
 * work.strokeStarted();
 * work.run("map", () => map.drawThumbnail()); // waits
 * work.strokeEnded(); // the map is redrawn 300ms later, unless another stroke starts first
 */
export default class BackgroundWork {
  /** Current time in milliseconds (replaceable for tests) */
  now: () => number = () => performance.now();

  private readonly log?: StrokeLog;

  private readonly tasks = new Map<string, Task>();

  private drawing = false;

  /** When the last stroke ended */
  private lastStroke = -Infinity;

  private timer?: ReturnType<typeof setTimeout>;

  constructor(log?: StrokeLog) {
    this.log = log;
  }

  /** Names of the work waiting to run */
  get pending(): readonly string[] {
    return [...this.tasks.keys()];
  }

  /**
   * Run some work once drawing pauses (see the class description).
   */
  run(name: string, run: () => unknown): void {
    const since = this.tasks.get(name)?.since ?? this.now();
    this.tasks.set(name, { run, since });
    this.plan();
  }

  /**
   * Forget work that hasn't run yet.
   */
  cancel(name: string): void {
    this.tasks.delete(name);
    this.plan();
  }

  /** A stroke started: hold all work until it ends */
  strokeStarted(): void {
    this.drawing = true;
    this.plan();
  }

  /** A stroke ended (or was cancelled): run the work once drawing pauses */
  strokeEnded(): void {
    this.drawing = false;
    this.lastStroke = this.now();
    // Not during the stroke's own handling, even if the work is due
    this.plan(false);
  }

  /**
   * Run the waiting work now if it's due (and `now` allows), or set a timer for when it will be (unless drawing).
   */
  private plan(now = true): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.drawing || this.tasks.size === 0) return;
    const oldest = Math.min(...[...this.tasks.values()].map((t) => t.since));
    const runAt = Math.min(
      this.lastStroke + DRAWING_PAUSE_MS,
      oldest + MAX_WAIT_MS,
    );
    const wait = runAt - this.now();
    if (wait <= 0 && now) this.flush();
    else this.timer = setTimeout(() => this.flush(), Math.max(0, wait));
  }

  /**
   * Run all waiting work, logging how long each took. If any throws, the rest still runs, then the first error is
   * thrown.
   */
  private flush(): void {
    this.timer = undefined;
    const tasks = [...this.tasks];
    this.tasks.clear();
    const errors: unknown[] = [];
    for (const [name, { run }] of tasks) {
      try {
        if (this.log) this.log.measure(name, run);
        else run();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw errors[0];
  }
}
