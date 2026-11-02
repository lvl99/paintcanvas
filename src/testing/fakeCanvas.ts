import { vi } from "vitest";
import type { CanvasFactory } from "../lib/classes/Layer";

/** Fake 2D context recording the calls layers make */
export interface FakeContext {
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  /** Returns transparent pixels unless replaced */
  getImageData: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
}

/**
 * Create a canvas factory that returns fake canvases (jsdom has no `OffscreenCanvas`).
 *
 * @param hasContext - set to false to simulate a canvas without a 2D context
 */
export const createFakeCanvasFactory =
  (hasContext = true): CanvasFactory =>
  (width, height) => {
    const context: FakeContext = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
      })),
      save: vi.fn(),
      restore: vi.fn(),
    };
    return {
      width,
      height,
      getContext: () => (hasContext ? context : null),
    } as unknown as OffscreenCanvas;
  };

/**
 * Get the fake context of a fake canvas.
 */
export const fakeContext = (canvas: OffscreenCanvas): FakeContext =>
  canvas.getContext("2d") as unknown as FakeContext;
