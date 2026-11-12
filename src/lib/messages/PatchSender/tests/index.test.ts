// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeRgbaDeflate,
  ImageEncoding,
  type BoundingBox,
} from "../../../image";
import type { PatchMessage } from "../..";
import PatchSender, { changedArea, cropRgba, PATCH_DELAY_MS } from "..";

afterEach(() => vi.useRealTimers());

/** Fake only the sync's own timers: compression needs the real ones */
const useFakeTimers = () =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

describe("changedArea", () => {
  it("should find the smallest box around the pixels that differ", () => {
    const before = new Uint32Array(5 * 4);
    const after = before.slice();
    after[1 * 5 + 3] = 1;
    after[2 * 5 + 1] = 1;
    expect(changedArea(before, after, 5, 4)).toEqual([1, 1, 4, 3]);
  });

  it("should find nothing when the images are the same", () => {
    const image = new Uint32Array(4).fill(7);
    expect(changedArea(image, image.slice(), 2, 2)).toBeUndefined();
  });
});

describe("cropRgba", () => {
  it("should copy a box of pixels", () => {
    // 3 × 2 pixels, each pixel's bytes set to its index
    const rgba = new Uint8ClampedArray(3 * 2 * 4).map((_, i) =>
      Math.floor(i / 4),
    );
    expect([...cropRgba(rgba, 3, [1, 0, 3, 2])]).toEqual([
      1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 5, 5, 5, 5,
    ]);
  });
});

/** A drawing sync over a fake canvas whose pixels the test sets */
const setup = (width = 4, height = 3) => {
  let pixels = new Uint8ClampedArray(width * height * 4);
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels.slice() })),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  const createCanvas = vi.fn(
    () => ({ getContext: () => context }) as unknown as OffscreenCanvas,
  );
  const layer = {
    visible: true,
    opacity: 1,
    blendMode: "source-over",
    canvas: {},
  } as never;
  const sent: PatchMessage[] = [];
  const send = vi.fn((message: PatchMessage) => void sent.push(message));
  const sync = new PatchSender({
    width,
    height,
    layers: () => [layer],
    send,
    createCanvas,
  });
  /** Set one pixel's colour */
  const paint = (x: number, y: number, value = 255) => {
    pixels = pixels.slice();
    pixels.fill(value, (y * width + x) * 4, (y * width + x + 1) * 4);
  };
  return { sync, sent, send, context, createCanvas, paint, layer };
};

/** The pixels in an image message */
const pixelsOf = async (message: PatchMessage) => [
  ...(await decodeRgbaDeflate(message.data, message.coords)),
];

describe("PatchSender", () => {
  it("should send only the area that changed, flattened from the user's layers", async () => {
    const { sync, sent, context, createCanvas, paint, layer } = setup();
    expect(createCanvas).toHaveBeenCalledWith(4, 3);
    paint(2, 1);
    await sync.sync();
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 4, 3);
    expect(context.drawImage).toHaveBeenCalledWith(
      (layer as { canvas: unknown }).canvas,
      0,
      0,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      protocol: 2,
      type: "patch",
      coords: [2, 1, 3, 2],
      encoding: ImageEncoding.RgbaDeflate,
    });
    expect(await pixelsOf(sent[0]!)).toEqual([255, 255, 255, 255]);

    // Only what changed since the last sync is sent next time
    paint(0, 0);
    await sync.sync();
    expect(sent[1]!.coords).toEqual([0, 0, 1, 1]);
  });

  it("should send nothing when nothing changed", async () => {
    const { sync, send } = setup();
    await sync.sync();
    expect(send).not.toHaveBeenCalled();
  });

  it("should send changes together shortly after the last one", async () => {
    useFakeTimers();
    const { sync, send, paint } = setup();
    paint(0, 0);
    sync.schedule();
    vi.advanceTimersByTime(PATCH_DELAY_MS - 1);
    paint(3, 2);
    sync.schedule();
    vi.advanceTimersByTime(PATCH_DELAY_MS - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    // Waits for the scheduled sync
    await sync.sync();
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].coords).toEqual([0, 0, 4, 3]);
  });

  it("should run a due sync when whenIdle says, and not once stopped", async () => {
    useFakeTimers();
    const { context, paint } = setup();
    const send = vi.fn();
    const waiting: (() => unknown)[] = [];
    const sync = new PatchSender({
      width: 4,
      height: 3,
      layers: () => [],
      send,
      createCanvas: () =>
        ({ getContext: () => context }) as unknown as OffscreenCanvas,
      whenIdle: (run) => waiting.push(run),
    });
    paint(0, 0);
    sync.schedule();
    vi.advanceTimersByTime(PATCH_DELAY_MS);
    expect(waiting).toHaveLength(1);
    expect(context.getImageData).not.toHaveBeenCalled();
    await waiting[0]!();
    expect(send).toHaveBeenCalledOnce();
    paint(1, 0);
    sync.schedule();
    vi.advanceTimersByTime(PATCH_DELAY_MS);
    sync.stop();
    expect(waiting[1]!()).toBeUndefined();
    expect(context.getImageData).toHaveBeenCalledOnce();
  });

  it("should use the given delay, and cancel a pending sync when stopped", async () => {
    useFakeTimers();
    const { context, paint } = setup();
    const send = vi.fn();
    const sync = new PatchSender({
      width: 4,
      height: 3,
      layers: () => [],
      send,
      createCanvas: () =>
        ({ getContext: () => context }) as unknown as OffscreenCanvas,
      delayMs: 10,
    });
    paint(0, 0);
    sync.schedule();
    vi.advanceTimersByTime(10);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    sync.schedule();
    sync.stop();
    vi.advanceTimersByTime(10);
    // Waits for anything running
    await sync.sync();
    expect(context.getImageData).toHaveBeenCalledTimes(2);
  });

  it("should not send pixels counted as already sent", async () => {
    const { sync, sent, paint } = setup();
    paint(1, 1);
    paint(2, 1);
    const area: BoundingBox = [1, 1, 3, 2];
    sync.markSent(area, new Uint8ClampedArray(8).fill(255));
    await sync.sync();
    expect(sent).toEqual([]);
    paint(2, 1, 0);
    await sync.sync();
    expect(sent[0]!.coords).toEqual([2, 1, 3, 2]);
  });

  it("should send failed changes with the next sync", async () => {
    const { sync, send, paint } = setup();
    paint(1, 1);
    send.mockImplementationOnce(() => {
      throw new Error("Not delivered");
    });
    await expect(sync.sync()).rejects.toThrow("Not delivered");
    paint(2, 2);
    await sync.sync();
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ coords: [1, 1, 3, 3] }),
    );
  });

  it("should not fail a scheduled sync whose send fails", async () => {
    useFakeTimers();
    const { sync, send, paint } = setup();
    send.mockImplementationOnce(() => {
      throw new Error("Not delivered");
    });
    paint(0, 0);
    sync.schedule();
    vi.advanceTimersByTime(PATCH_DELAY_MS);
    // Waits for the scheduled sync, then sends what it couldn't
    await sync.sync();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should never run syncs at the same time", async () => {
    const { paint, context } = setup();
    let release!: () => void;
    const order: string[] = [];
    const slow = new PatchSender({
      width: 4,
      height: 3,
      layers: () => [],
      send: () =>
        new Promise<void>((resolve) => {
          order.push("sending");
          release = () => {
            order.push("sent");
            resolve();
          };
        }),
      createCanvas: () =>
        ({ getContext: () => context }) as unknown as OffscreenCanvas,
    });
    paint(0, 0);
    const first = slow.sync();
    await vi.waitFor(() => expect(order).toEqual(["sending"]));
    paint(1, 0);
    const second = slow.sync();
    // The second sync waits for the first to finish sending
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual(["sending"]);
    release();
    await first;
    await vi.waitFor(() => expect(order).toHaveLength(3));
    release();
    await second;
    expect(order).toEqual(["sending", "sent", "sending", "sent"]);
  });
});
