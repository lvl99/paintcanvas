import type { BrushStrokePoint } from "../types";

/** Shortest allowed sample rate in milliseconds */
export const MIN_SAMPLE_RATE = 5;

/** Longest allowed sample rate in milliseconds */
export const MAX_SAMPLE_RATE = 400;

/** Default sample rate in milliseconds */
export const DEFAULT_SAMPLE_RATE = 5;

/**
 * Clamp a preset's sample rate to 5–400 ms.
 *
 * @example
 * clampSampleRate(1000); // 400
 */
export const clampSampleRate = (rate: number | undefined): number =>
  Math.max(
    MIN_SAMPLE_RATE,
    Math.min(MAX_SAMPLE_RATE, rate ?? DEFAULT_SAMPLE_RATE),
  );

/**
 * Records a stroke's points over time: the first point (pointer down), then a point at most every `sampleRate` milliseconds while the pointer moves, and the last point (pointer up).
 * No points are recorded while the pointer is still, even if it is held down.
 *
 * @example
 * const sampler = new StrokeSampler(50);
 * sampler.start({ x: 0, y: 0 }, 0);
 * sampler.move({ x: 5, y: 0 }, 20); // undefined (too soon)
 * sampler.move({ x: 9, y: 0 }, 60); // recorded
 * sampler.end({ x: 12, y: 0 }, 70); // recorded
 */
export default class StrokeSampler {
  /** Milliseconds between recorded points */
  readonly sampleRate: number;

  /** Points recorded so far */
  readonly points: BrushStrokePoint[] = [];

  private lastTime = 0;

  constructor(sampleRate?: number) {
    this.sampleRate = clampSampleRate(sampleRate);
  }

  /** The most recently recorded point */
  get last(): BrushStrokePoint | undefined {
    return this.points.at(-1);
  }

  /**
   * Begin a stroke at the pointer-down point. Always recorded.
   */
  start(point: BrushStrokePoint, time: number): BrushStrokePoint {
    this.points.length = 0;
    return this.record(point, time);
  }

  /**
   * Offer a point while the pointer moves. Returns it if recorded: enough time has passed and the pointer has moved.
   */
  move(point: BrushStrokePoint, time: number): BrushStrokePoint | undefined {
    if (time - this.lastTime < this.sampleRate || !this.hasMoved(point))
      return undefined;
    return this.record(point, time);
  }

  /**
   * Finish the stroke at the pointer-up point. Returns it if recorded (it differs from the last recorded position).
   */
  end(point: BrushStrokePoint, time: number): BrushStrokePoint | undefined {
    return this.hasMoved(point) ? this.record(point, time) : undefined;
  }

  /**
   * Check whether a point is at a different position from the last recorded point.
   */
  private hasMoved(point: BrushStrokePoint): boolean {
    const last = this.last;
    return !last || last.x !== point.x || last.y !== point.y;
  }

  /**
   * Record a point.
   */
  private record(point: BrushStrokePoint, time: number): BrushStrokePoint {
    this.points.push(point);
    this.lastTime = time;
    return point;
  }
}
