import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SNAPSHOT_QUALITIES,
  renderJpegImage,
  renderScreenshot,
  saveFile,
  screenshotName,
  JSON_FILE_TYPE,
} from "..";
import LayerStack from "../../../classes/LayerStack";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("screenshotName", () => {
  it("should name screenshots by date and time", () => {
    expect(screenshotName(new Date(2026, 9, 19, 14, 30, 5))).toBe(
      "paintcanvas-2026-10-19-143005.png",
    );
    expect(screenshotName()).toMatch(
      /^paintcanvas-\d{4}-\d{2}-\d{2}-\d{6}\.png$/,
    );
    expect(screenshotName(new Date(2026, 9, 19, 14, 30, 5), "myapp")).toBe(
      "myapp-2026-10-19-143005.png",
    );
  });
});

describe("renderScreenshot", () => {
  it("should flatten the layers at full size and encode a PNG", async () => {
    const { factory, created } = createRecordingCanvasFactory();
    const stack = new LayerStack(30, 20, factory);
    const blob = new Blob(["png"]);
    const canvasFactory = (width: number, height: number) =>
      Object.assign(factory(width, height), {
        convertToBlob: vi.fn(async () => blob),
      });
    const image = {} as CanvasImageSource;
    const result = await renderScreenshot(
      stack.layers,
      30,
      20,
      { layer: stack.active, image },
      canvasFactory,
    );
    expect(result).toBe(blob);
    const screenshot = created.at(-1)!;
    expect(screenshot.calls).toContainEqual(["fillRect", 0, 0, 30, 20]);
    expect(screenshot.calls).toContainEqual(["drawImage", image, 0, 0]);
    expect(
      (
        screenshot.canvas as unknown as {
          convertToBlob: ReturnType<typeof vi.fn>;
        }
      ).convertToBlob,
    ).toHaveBeenCalledWith({
      type: "image/png",
    });
  });
});

describe("renderJpegImage", () => {
  /** A canvas factory whose JPEGs are `bytesPerPixel` bytes per pixel at quality 1, less at lower qualities */
  const jpegFactory = (bytesPerPixel: number) => {
    const { factory, created } = createRecordingCanvasFactory();
    const canvasFactory = (width: number, height: number) =>
      Object.assign(factory(width, height), {
        convertToBlob: vi.fn(
          async ({ quality }: { quality: number }) =>
            new Blob([
              new Uint8Array(
                Math.round(width * height * bytesPerPixel * quality),
              ),
            ]),
        ),
      });
    return { canvasFactory, created };
  };

  it("should encode a full-size JPEG at the best quality that fits", async () => {
    const { canvasFactory, created } = jpegFactory(1);
    const stack = new LayerStack(
      100,
      50,
      createRecordingCanvasFactory().factory,
    );
    const image = {} as CanvasImageSource;
    const result = await renderJpegImage(
      stack.layers,
      100,
      50,
      { layer: stack.active, image },
      canvasFactory,
      3999,
    );
    // 5000 × 0.92 and 0.8 are too large; 0.7 fits
    expect([result.width, result.height, result.blob.size]).toEqual([
      100, 50, 3500,
    ]);
    const canvas = created.at(-1)!;
    expect(canvas.calls).toContainEqual(["drawImage", image, 0, 0]);
    expect(
      (
        canvas.canvas as unknown as { convertToBlob: ReturnType<typeof vi.fn> }
      ).convertToBlob.mock.calls.map(([options]) => options),
    ).toEqual(
      SNAPSHOT_QUALITIES.map((quality) => ({ type: "image/jpeg", quality })),
    );
  });

  it("should make the image smaller until it fits", async () => {
    const { canvasFactory } = jpegFactory(1);
    const stack = new LayerStack(
      100,
      80,
      createRecordingCanvasFactory().factory,
    );
    const result = await renderJpegImage(
      stack.layers,
      100,
      80,
      undefined,
      canvasFactory,
      3000,
    );
    // 75 × 60 at 0.7 is 3150 bytes; 56 × 45 at 0.92 is 2318
    expect([result.width, result.height]).toEqual([56, 45]);
  });

  it("should stop at 1 pixel", async () => {
    const { canvasFactory } = jpegFactory(1000);
    const stack = new LayerStack(2, 2, createRecordingCanvasFactory().factory);
    const result = await renderJpegImage(
      stack.layers,
      2,
      2,
      undefined,
      canvasFactory,
      1,
    );
    expect([result.width, result.height]).toEqual([1, 1]);
  });

  it("should keep the full size without a limit by default", async () => {
    const { canvasFactory } = jpegFactory(0.1);
    const stack = new LayerStack(
      10,
      10,
      createRecordingCanvasFactory().factory,
    );
    const result = await renderJpegImage(
      stack.layers,
      10,
      10,
      undefined,
      canvasFactory,
    );
    expect(result.width).toBe(10);
  });
});

describe("saveFile", () => {
  const blob = new Blob(["png"], { type: "image/png" });

  it("should offer other kinds of file in the save dialog", async () => {
    const picker = vi.fn(async () => ({
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    }));
    await saveFile(blob, "a.json", picker, JSON_FILE_TYPE);
    expect(picker).toHaveBeenCalledWith({
      suggestedName: "a.json",
      types: [JSON_FILE_TYPE],
    });
  });

  it("should save with the save dialog when the browser has one", async () => {
    const write = vi.fn();
    const close = vi.fn();
    const picker = vi.fn(async () => ({
      createWritable: async () => ({ write, close }),
    }));
    expect(await saveFile(blob, "a.png", picker)).toBe("picker");
    expect(picker).toHaveBeenCalledWith({
      suggestedName: "a.png",
      types: [{ description: "PNG image", accept: { "image/png": [".png"] } }],
    });
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalled();
  });

  it("should do nothing when the dialog is cancelled, and pass on other errors", async () => {
    const cancelled = vi.fn(async () => {
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    });
    expect(await saveFile(blob, "a.png", cancelled)).toBeUndefined();
    const failed = vi.fn(async () => {
      throw new Error("disk full");
    });
    await expect(saveFile(blob, "a.png", failed)).rejects.toThrow("disk full");
  });

  it("should download the file when there is no save dialog", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:screenshot");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("a.png");
        expect(this.href).toBe("blob:screenshot");
      });
    expect(await saveFile(blob, "a.png", undefined)).toBe("download");
    expect(click).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:screenshot");
    click.mockRestore();
  });

  it("should use the browser's save dialog by default when it exists", async () => {
    const picker = vi.fn(async () => {
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    });
    vi.stubGlobal("showSaveFilePicker", picker);
    expect(await saveFile(blob, "a.png")).toBeUndefined();
    expect(picker).toHaveBeenCalled();
  });
});
