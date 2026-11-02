/** Default number of log entries kept */
export const DEFAULT_STROKE_LOG_LIMIT = 200;

/**
 * What a stroke log entry is about:
 * - `start`: a stroke started
 * - `end`: a stroke finished, with its measurements
 * - `cancel`: a stroke in progress was abandoned, with its measurements so far
 * - `ignore`: a pointer press didn't start a stroke
 * - `gesture`: a touch gesture did an action (e.g. undo)
 * - `work`: other work that kept the page busy (e.g. syncing the drawing)
 */
export type StrokeLogKind =
  "start" | "end" | "cancel" | "ignore" | "gesture" | "work";

/** A logged event */
export interface StrokeLogEntry {
  /** Time the entry was logged (Unix epoch milliseconds) */
  at: number;
  kind: StrokeLogKind;
  /** What happened, e.g. the pointer type, why a stroke was cancelled, or the work done */
  detail: string;
  /** Measurements by name: times in milliseconds, otherwise counts */
  measures: Record<string, number>;
}

/** What was on screen when a stroke started */
export interface StrokeScene {
  /** Layers drawn (visible, including other people's drawings) */
  layers: number;
  /** Zoom as a percentage */
  zoomPct: number;
}

/** The stroke being measured */
interface MeasuredStroke {
  scene?: StrokeScene;
  pointerType: string;
  /** When the pointer pressed (event time) */
  startTime: number;
  /** How long the press waited before it was handled (ms) */
  startWait: number;
  /** Time taken to start the stroke (ms) */
  beginMs: number;
  /** Pointer events handled while drawing */
  moves: number;
  /** Longest a pointer move waited before it was handled (ms) */
  maxMoveWait: number;
  /** Total time taken handling pointer moves (ms) */
  moveMs: number;
  /** Frames drawn while drawing */
  frames: number;
  /** Longest frame to draw (ms) */
  maxFrameMs: number;
  /** When the last frame was drawn (or the stroke started) */
  lastFrameAt: number;
  /** Longest time between frames (ms) */
  maxFrameGap: number;
  /** Times the brush cursor was drawn */
  overlays: number;
  /** Time since the last stroke ended, if any (ms) */
  gap?: number;
}

/** Round a measurement to 0.1 */
const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * Records when brush and eraser strokes start, end, are cancelled or are ignored, with timings for each stroke, plus
 * other work done meanwhile (see `BackgroundWork`), for the debug panel. Times are in the same clock as `event.timeStamp` and
 * `performance.now()`. Keeps only the most recent entries.
 *
 * Each finished or cancelled stroke measures (in ms unless noted):
 * - `gap`: time since the previous stroke ended
 * - `wait`: how long the press waited before it was handled (the page was busy)
 * - `begin`: time taken to start the stroke
 * - `moves`: pointer events handled (count), `maxMoveWait`: longest one waited, `moveMs`: total time handling them
 * - `frames`: frames drawn (count), `maxFrame`: longest frame to draw, `maxFrameGap`: longest time between frames
 *   (including after the last one), `overlays`: times the brush cursor was drawn (count)
 * - `end`: time taken to write the stroke into its layer
 * - `duration`: from press to release
 * - `layers`: layers drawn (count) and `zoomPct`: the zoom as a percentage, when the stroke started (if given)
 *
 * Records nothing while switched off (`enabled`); work given to `measure` still runs.
 *
 * Dispatches a `change` event when entries are added or cleared.
 *
 * @example
 * const log = new StrokeLog();
 * log.begin("pen", event.timeStamp, 2);
 * log.move(event.timeStamp, 0.5);
 * log.end(event.timeStamp, 3); // entry with kind "end" and its measures
 */
export default class StrokeLog extends EventTarget {
  /** Maximum number of entries kept */
  readonly limit: number;

  /** Current time in milliseconds (replaceable for tests) */
  now: () => number = () => performance.now();

  /** Whether anything is recorded */
  enabled = true;

  private items: StrokeLogEntry[] = [];

  private stroke?: MeasuredStroke;

  /** When the last stroke ended or was cancelled (event time) */
  private lastEnd?: number;

  constructor(limit: number = DEFAULT_STROKE_LOG_LIMIT) {
    super();
    this.limit = limit;
  }

  /** Logged entries, oldest first */
  get entries(): readonly StrokeLogEntry[] {
    return this.items;
  }

  /** Whether a stroke is being measured */
  get drawing(): boolean {
    return this.stroke !== undefined;
  }

  /**
   * A stroke started: the pointer type, when it pressed (event time), how long starting the stroke took, and what was on
   * screen.
   */
  begin(
    pointerType: string,
    eventTime: number,
    beginMs: number,
    scene?: StrokeScene,
  ): void {
    if (!this.enabled) return;
    const handled = this.now() - beginMs;
    this.stroke = {
      scene,
      pointerType,
      startTime: eventTime,
      startWait: Math.max(0, handled - eventTime),
      beginMs,
      moves: 0,
      maxMoveWait: 0,
      moveMs: 0,
      frames: 0,
      maxFrameMs: 0,
      lastFrameAt: handled,
      maxFrameGap: 0,
      overlays: 0,
      gap: this.lastEnd === undefined ? undefined : eventTime - this.lastEnd,
    };
    this.add("start", pointerType, {
      wait: this.stroke.startWait,
      ...(this.stroke.gap === undefined ? {} : { gap: this.stroke.gap }),
      ...scene,
    });
  }

  /**
   * The stroke continued: when the pointer moved (event time) and how long handling it took.
   */
  move(eventTime: number, moveMs: number): void {
    const stroke = this.stroke;
    if (!stroke) return;
    const handled = this.now() - moveMs;
    stroke.moves++;
    stroke.moveMs += moveMs;
    stroke.maxMoveWait = Math.max(stroke.maxMoveWait, handled - eventTime);
  }

  /**
   * A frame was drawn, taking `ms`; counted towards the stroke in progress, if any.
   */
  frame(ms: number): void {
    const stroke = this.stroke;
    if (!stroke) return;
    const now = this.now();
    stroke.frames++;
    stroke.maxFrameMs = Math.max(stroke.maxFrameMs, ms);
    stroke.maxFrameGap = Math.max(stroke.maxFrameGap, now - stroke.lastFrameAt);
    stroke.lastFrameAt = now;
  }

  /**
   * The brush cursor was drawn; counted towards the stroke in progress, if any.
   */
  overlay(): void {
    if (this.stroke) this.stroke.overlays++;
  }

  /**
   * The stroke finished: when the pointer released (event time) and how long writing it into the layer took.
   */
  end(eventTime: number, endMs: number): void {
    const stroke = this.stroke;
    if (!stroke) return;
    this.finish("end", stroke.pointerType, eventTime, { end: endMs });
  }

  /**
   * The stroke in progress was abandoned, and why.
   */
  cancel(reason: string): void {
    const stroke = this.stroke;
    if (!stroke) return;
    this.finish("cancel", `${stroke.pointerType}: ${reason}`, this.now(), {});
  }

  /**
   * A pointer press didn't start a stroke, and why.
   */
  ignore(pointerType: string, reason: string): void {
    this.add("ignore", `${pointerType}: ${reason}`, {});
  }

  /**
   * A touch gesture did an action.
   */
  gesture(gesture: string, action: string): void {
    this.add("gesture", `${gesture}: ${action}`, {});
  }

  /**
   * Other work was done, with its measurements: `ms` for how long it kept the page busy, and `total` for how long work
   * that finishes later took altogether (which can include waiting that doesn't keep the page busy).
   */
  work(name: string, measures: { ms?: number; total?: number }): void {
    this.add("work", name, measures);
  }

  /**
   * Run some work and return its result, logging how long it kept the page busy, or for work that finishes later (a
   * promise), how long it took altogether once it settles.
   *
   * @example
   * log.measure("map", () => drawMap()); // logs "map" with how long it took
   * log.measure("save", () => save()); // logs "save" with how long it took once saved (or failed)
   */
  measure<T>(name: string, run: () => T): T {
    if (!this.enabled) return run();
    const start = this.now();
    const result = run();
    if (result instanceof Promise) {
      const done = () => this.work(name, { total: this.now() - start });
      result.then(done, done);
    } else this.work(name, { ms: this.now() - start });
    return result;
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    this.items = [];
    this.dispatchEvent(new Event("change"));
  }

  /** Log a finished or cancelled stroke with its measurements, and stop measuring it */
  private finish(
    kind: "end" | "cancel",
    detail: string,
    eventTime: number,
    extra: Record<string, number>,
  ): void {
    const stroke = this.stroke as MeasuredStroke;
    this.stroke = undefined;
    this.lastEnd = eventTime;
    this.add(kind, detail, {
      ...(stroke.gap === undefined ? {} : { gap: stroke.gap }),
      wait: stroke.startWait,
      begin: stroke.beginMs,
      moves: stroke.moves,
      maxMoveWait: stroke.maxMoveWait,
      moveMs: stroke.moveMs,
      frames: stroke.frames,
      maxFrame: stroke.maxFrameMs,
      maxFrameGap: Math.max(
        stroke.maxFrameGap,
        this.now() - stroke.lastFrameAt,
      ),
      overlays: stroke.overlays,
      ...extra,
      duration: eventTime - stroke.startTime,
      ...stroke.scene,
    });
  }

  /** Add an entry, rounding its measurements (unless switched off) */
  private add(
    kind: StrokeLogKind,
    detail: string,
    measures: Record<string, number>,
  ): void {
    if (!this.enabled) return;
    const rounded = Object.fromEntries(
      Object.entries(measures).map(([name, value]) => [name, round(value)]),
    );
    this.items = [
      ...this.items,
      { at: Date.now(), kind, detail, measures: rounded },
    ].slice(-this.limit);
    this.dispatchEvent(new Event("change"));
  }
}

/** The stroke log's CSV columns after time, event and detail: every measurement, in order */
export const STROKE_LOG_COLUMNS = [
  "gap",
  "wait",
  "begin",
  "moves",
  "maxMoveWait",
  "moveMs",
  "frames",
  "maxFrame",
  "maxFrameGap",
  "overlays",
  "end",
  "duration",
  "layers",
  "zoomPct",
  "ms",
  "total",
] as const;

/**
 * A CSV field, quoted if it holds a comma, quote or line break.
 *
 * @example
 * csvField('a "b", c'); // '"a ""b"", c"'
 */
export const csvField = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/**
 * Stroke log entries as CSV, oldest first, to paste somewhere for analysis: `#` lines describing the context first (e.g.
 * device and canvas), then a header row and one row per entry. Times are ISO 8601; measurements are in milliseconds
 * except counts (`moves`, `frames`, `layers`) and `zoomPct`; empty fields don't apply to that entry.
 *
 * @example
 * strokeLogCsv(log.entries, { version: "1.13.0" });
 * // "# version: 1.13.0\ntime,event,detail,gap,…\n2026-10-31T20:37:55.545Z,start,mouse,6.7,0.2,…"
 */
export const strokeLogCsv = (
  entries: readonly StrokeLogEntry[],
  context: Record<string, string | number> = {},
): string =>
  [
    ...Object.entries(context).map(([name, value]) => `# ${name}: ${value}`),
    ["time", "event", "detail", ...STROKE_LOG_COLUMNS].join(","),
    ...entries.map(({ at, kind, detail, measures }) =>
      [
        new Date(at).toISOString(),
        kind,
        csvField(detail),
        ...STROKE_LOG_COLUMNS.map((name) =>
          name in measures ? String(measures[name]) : "",
        ),
      ].join(","),
    ),
  ].join("\n");
