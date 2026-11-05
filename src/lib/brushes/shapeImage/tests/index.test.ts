import { describe, it, expect, vi } from "vitest";
import {
  MAX_SHAPE_FILE_BYTES,
  SHAPE_ERRORS,
  ShapeImageError,
  readClipboardShape,
  readShapeImage,
} from "..";

/** A canvas factory whose canvases encode to 3 bytes and record their size */
const fakeCanvases = () => {
  const sizes: [number, number][] = [];
  const drawImage = vi.fn();
  const createCanvas = (width: number, height: number) => {
    sizes.push([width, height]);
    return {
      getContext: () => ({ drawImage }),
      convertToBlob: async () => new Blob([new Uint8Array([1, 2, 3])]),
    } as unknown as OffscreenCanvas;
  };
  return { createCanvas, sizes, drawImage };
};

const png = (size = 10) =>
  new Blob([new Uint8Array(size)], { type: "image/png" });

describe("readShapeImage", () => {
  it("should turn a PNG into a data URL shape, shrinking large images to 512 pixels", async () => {
    const { createCanvas, sizes } = fakeCanvases();
    const decode = vi.fn(
      async () => ({ width: 1024, height: 256 }) as ImageBitmap,
    );
    expect(await readShapeImage(png(), { decode, createCanvas })).toEqual({
      image: "data:image/png;base64,AQID",
      width: 512,
      height: 128,
    });
    expect(sizes).toEqual([[512, 128]]);
    decode.mockResolvedValueOnce({ width: 40, height: 20 } as ImageBitmap);
    expect((await readShapeImage(png(), { decode, createCanvas })).width).toBe(
      40,
    );
  });

  it.each([
    [
      "isn't a PNG",
      new Blob([new Uint8Array(1)], { type: "image/jpeg" }),
      SHAPE_ERRORS.type,
    ],
    ["is over 2 MB", png(MAX_SHAPE_FILE_BYTES + 1), SHAPE_ERRORS.size],
  ])("should refuse an image that %s", async (_label, blob, message) => {
    await expect(readShapeImage(blob)).rejects.toEqual(
      new ShapeImageError(message),
    );
  });

  it("should explain images that can't be decoded", async () => {
    await expect(
      readShapeImage(png(), {
        decode: async () => {
          throw new Error("bad");
        },
      }),
    ).rejects.toEqual(new ShapeImageError(SHAPE_ERRORS.decode));
  });

  it("should decode with the browser by default", async () => {
    const createImageBitmap = vi.fn(async () => ({ width: 2, height: 2 }));
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const { createCanvas } = fakeCanvases();
    await readShapeImage(png(), { createCanvas });
    expect(createImageBitmap).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("readClipboardShape", () => {
  const deps = {
    decode: async () => ({ width: 4, height: 4 }) as ImageBitmap,
    ...fakeCanvases(),
  };

  it("should read a PNG from the clipboard", async () => {
    const clipboard = {
      read: async () =>
        [
          { types: ["text/plain"], getType: vi.fn() },
          { types: ["image/png"], getType: async () => png() },
        ] as unknown as ClipboardItems,
    };
    expect((await readClipboardShape(clipboard, deps)).width).toBe(4);
  });

  it("should explain when there is no PNG to paste", async () => {
    const empty = { read: async () => [] as unknown as ClipboardItems };
    const denied = {
      read: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    };
    for (const clipboard of [empty, denied])
      await expect(readClipboardShape(clipboard, deps)).rejects.toEqual(
        new ShapeImageError(SHAPE_ERRORS.noImage),
      );
  });

  it("should use the fallback PNG (e.g. image data copied on the canvas) when the clipboard has none", async () => {
    const empty = { read: async () => [] as unknown as ClipboardItems };
    const denied = {
      read: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    };
    for (const clipboard of [empty, denied])
      expect(
        (await readClipboardShape(clipboard, deps, async () => png())).width,
      ).toBe(4);
    await expect(
      readClipboardShape(empty, deps, async () => undefined),
    ).rejects.toEqual(new ShapeImageError(SHAPE_ERRORS.noImage));
  });

  it("should use the browser's clipboard by default", async () => {
    const read = vi.fn(async () => []);
    Object.defineProperty(navigator, "clipboard", {
      value: { read },
      configurable: true,
    });
    await expect(readClipboardShape()).rejects.toThrow(SHAPE_ERRORS.noImage);
    expect(read).toHaveBeenCalled();
  });
});
