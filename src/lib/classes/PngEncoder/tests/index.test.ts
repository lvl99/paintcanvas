import { describe, it, expect, vi, afterEach } from "vitest";
import PngEncoder, {
  PNG_WORKER_SOURCE,
  createPngWorker,
  encodePngHere,
} from "..";

afterEach(() => vi.unstubAllGlobals());

/** A canvas whose PNG is a blob saying where it was made */
const fakeCanvas = () =>
  ({
    getContext: vi.fn(),
    convertToBlob: vi.fn(async () => new Blob(["here"], { type: "image/png" })),
  }) as unknown as OffscreenCanvas;

/** A worker that answers each message as told, or not at all */
class FakeWorker extends EventTarget {
  posted: { id: number; bitmap: unknown }[] = [];
  terminate = vi.fn();
  postMessage(message: { id: number; bitmap: unknown }) {
    this.posted.push(message);
  }
  reply(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

/** Let promises waiting on each other run */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("encodePngHere", () => {
  it("should encode on this thread, making sure the canvas has a context", async () => {
    const canvas = fakeCanvas();
    expect(await (await encodePngHere(canvas)).text()).toBe("here");
    expect(canvas.getContext).toHaveBeenCalledWith("2d");
    expect(canvas.convertToBlob).toHaveBeenCalledWith({ type: "image/png" });
  });
});

describe("createPngWorker", () => {
  it("should give null without workers or createImageBitmap, or when the page doesn't allow the worker", () => {
    vi.stubGlobal("Worker", undefined);
    expect(createPngWorker()).toBeNull();
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("createImageBitmap", undefined);
    expect(createPngWorker()).toBeNull();
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Blocked by CSP");
        }
      },
    );
    expect(createPngWorker()).toBeNull();
  });

  it("should make a worker from its code", () => {
    const made: string[] = [];
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: string) {
          made.push(url);
        }
      },
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:png-worker");
    expect(createPngWorker()).not.toBeNull();
    expect(made).toEqual(["blob:png-worker"]);
    expect(PNG_WORKER_SOURCE).toContain("convertToBlob");
  });
});

describe("PngEncoder", () => {
  it("should encode here without a worker, asking for it only once", async () => {
    const factory = vi.fn(() => null);
    const encoder = new PngEncoder(factory);
    expect(await (await encoder.encode(fakeCanvas())).text()).toBe("here");
    await encoder.encode(fakeCanvas());
    expect(factory).toHaveBeenCalledOnce();
  });

  it("should send a copy of the canvas to the worker and give back its PNG", async () => {
    const worker = new FakeWorker();
    const bitmap = { close: vi.fn() };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );
    const encoder = new PngEncoder(() => worker as unknown as Worker);
    const canvas = fakeCanvas();
    const first = encoder.encode(canvas);
    const second = encoder.encode(fakeCanvas());
    await settle();
    expect(worker.posted).toEqual([
      { id: 0, bitmap },
      { id: 1, bitmap },
    ]);
    expect(canvas.getContext).toHaveBeenCalledWith("2d");
    const png = new Blob(["worker"]);
    worker.reply({ id: 1, blob: png });
    worker.reply({ id: 7, blob: png });
    expect(await second).toBe(png);
    // The worker couldn't encode: encoded here instead
    worker.reply({ id: 0, error: "No OffscreenCanvas" });
    expect(await (await first).text()).toBe("here");
    expect(canvas.convertToBlob).toHaveBeenCalled();
  });

  it("should stop using a worker that fails, encoding what it had here", async () => {
    const worker = new FakeWorker();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({})),
    );
    const factory = vi.fn(() => worker as unknown as Worker);
    const encoder = new PngEncoder(factory);
    const waiting = encoder.encode(fakeCanvas());
    await settle();
    worker.dispatchEvent(new Event("error"));
    expect(await (await waiting).text()).toBe("here");
    expect(worker.terminate).toHaveBeenCalled();
    await encoder.encode(fakeCanvas());
    expect(worker.posted).toHaveLength(1);
    expect(factory).toHaveBeenCalledOnce();
  });

  it("should encode here when the canvas can't be copied", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("No copy");
      }),
    );
    const encoder = new PngEncoder(() => new FakeWorker() as unknown as Worker);
    expect(await (await encoder.encode(fakeCanvas())).text()).toBe("here");
  });
});
