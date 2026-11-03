import { describe, it, expect } from "vitest";
import {
  base64ByteLength,
  base64ToBytes,
  boundingBoxSize,
  bytesToBase64,
  decodeRgbaDeflate,
  deflate,
  encodeRgbaDeflate,
  inflate,
  pixelFingerprint,
  rgbaByteLength,
} from "../index";

/** Create RGBA pixels with a repeating pattern */
const pattern = (length: number) =>
  Uint8ClampedArray.from({ length }, (_, i) => i % 251);

describe("boundingBoxSize and rgbaByteLength", () => {
  it("should calculate width, height and byte length", () => {
    expect(boundingBoxSize([10, 10, 30, 20])).toEqual({
      width: 20,
      height: 10,
    });
    expect(rgbaByteLength([0, 0, 2, 2])).toBe(16);
  });
});

describe("base64", () => {
  it("should round-trip bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe("aGk=");
  });

  it("should handle data larger than one chunk", () => {
    const bytes = new Uint8Array(pattern(100000));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("should measure decoded length without decoding", () => {
    expect(base64ByteLength("aGk=")).toBe(2);
    expect(base64ByteLength("aA==")).toBe(1);
    expect(base64ByteLength("aGlp")).toBe(3);
  });
});

describe("deflate and inflate", () => {
  it("should round-trip and compress repetitive data", async () => {
    const bytes = new Uint8Array(10000);
    const compressed = await deflate(bytes);
    expect(compressed.length).toBeLessThan(bytes.length);
    expect(await inflate(compressed, bytes.length)).toEqual(bytes);
  });

  it("should throw when output exceeds the limit (decompression bomb)", async () => {
    const compressed = await deflate(new Uint8Array(1_000_000));
    await expect(inflate(compressed, 1000)).rejects.toThrow(
      "Decompressed data exceeds 1000 bytes",
    );
  });
});

describe("encodeRgbaDeflate and decodeRgbaDeflate", () => {
  it("should round-trip RGBA pixels losslessly", async () => {
    const coords = [0, 0, 20, 10] as const satisfies [
      number,
      number,
      number,
      number,
    ];
    const rgba = pattern(rgbaByteLength(coords));
    const data = await encodeRgbaDeflate(rgba, coords);
    expect(await decodeRgbaDeflate(data, coords)).toEqual(rgba);
  });

  it("should reject RGBA data that does not match the bounding box", async () => {
    await expect(
      encodeRgbaDeflate(new Uint8ClampedArray(3), [0, 0, 1, 1]),
    ).rejects.toThrow("RGBA data length does not match bounding box size");
  });

  it("should reject decoded data that is too short", async () => {
    const data = await encodeRgbaDeflate(pattern(4), [0, 0, 1, 1]);
    await expect(decodeRgbaDeflate(data, [0, 0, 2, 1])).rejects.toThrow(
      "RGBA data length does not match bounding box size",
    );
  });

  it("should reject decoded data that is too long", async () => {
    const data = await encodeRgbaDeflate(pattern(16), [0, 0, 2, 2]);
    await expect(decodeRgbaDeflate(data, [0, 0, 1, 1])).rejects.toThrow(
      "Decompressed data exceeds 4 bytes",
    );
  });
});

describe("pixelFingerprint", () => {
  it("should give the same fingerprint for the same pixels, and another when any pixel changes", () => {
    const pixels = new Uint8ClampedArray(16).fill(7);
    const same = new Uint8ClampedArray(16).fill(7);
    const changed = new Uint8ClampedArray(16).fill(7);
    changed[13] = 8;
    expect(pixelFingerprint(pixels)).toBe(pixelFingerprint(same));
    expect(pixelFingerprint(pixels)).not.toBe(pixelFingerprint(changed));
    expect(pixelFingerprint(new Uint8ClampedArray(0))).toBe(0x811c9dc5);
  });

  it("should read pixels from where a view starts in its buffer", () => {
    const buffer = new Uint8ClampedArray(12).fill(1);
    buffer.fill(9, 4, 8);
    expect(pixelFingerprint(buffer.subarray(4, 8))).toBe(
      pixelFingerprint(new Uint8ClampedArray(4).fill(9)),
    );
  });
});
