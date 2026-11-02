// Image data in drawing messages: bounding boxes, base64, and raw RGBA pixels compressed with deflate.

/** An area of the canvas as [x1, y1, x2, y2] in pixels (x2 and y2 are exclusive) */
export type BoundingBox = [number, number, number, number];

/** How a patch's image data is encoded */
export const ImageEncoding = {
  /** Raw RGBA bytes compressed with deflate (lossless, no PNG overhead) */
  RgbaDeflate: "rgba-deflate",
  /** PNG file bytes (lossless) */
  Png: "png",
} as const;

export type ImageEncoding = (typeof ImageEncoding)[keyof typeof ImageEncoding];

/** Number of bytes per RGBA pixel */
export const BYTES_PER_PIXEL = 4;

/** Size of chunks used when converting bytes to base64, to stay within function argument limits */
const BASE64_CHUNK_SIZE = 0x8000;

/**
 * Get the width and height of a bounding box.
 *
 * @example
 * boundingBoxSize([10, 10, 30, 20]); // { width: 20, height: 10 }
 */
export const boundingBoxSize = ([x1, y1, x2, y2]: BoundingBox) => ({
  width: x2 - x1,
  height: y2 - y1,
});

/**
 * Get the number of raw RGBA bytes needed for a bounding box.
 *
 * @example
 * rgbaByteLength([0, 0, 2, 2]); // 16
 */
export const rgbaByteLength = (coords: BoundingBox): number => {
  const { width, height } = boundingBoxSize(coords);
  return width * height * BYTES_PER_PIXEL;
};

/**
 * Encode bytes as a base64 string.
 *
 * @example
 * bytesToBase64(new Uint8Array([104, 105])); // "aGk="
 */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
};

/**
 * Decode a base64 string to bytes.
 *
 * @example
 * base64ToBytes("aGk="); // Uint8Array [104, 105]
 */
export const base64ToBytes = (base64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Get the decoded byte length of a base64 string without decoding it.
 *
 * @example
 * base64ByteLength("aGk="); // 2
 */
export const base64ByteLength = (base64: string): number => {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
};

/** Bytes as a stream (through `Response`, which every runtime streams, unlike some `Blob` implementations) */
const streamOf = (bytes: Uint8Array<ArrayBuffer>) =>
  new Response(bytes).body as ReadableStream<Uint8Array<ArrayBuffer>>;

/**
 * Compress bytes with deflate using the built-in `CompressionStream`.
 *
 * @example
 * const compressed = await deflate(rgbaBytes);
 */
export const deflate = async (
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const stream = streamOf(bytes).pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/**
 * Decompress deflated bytes using the built-in `DecompressionStream`.
 *
 * Stops and throws as soon as the output exceeds `maxBytes`, so malicious data cannot exhaust memory (decompression bomb).
 *
 * @example
 * const rgba = await inflate(compressed, 2000 * 2000 * 4);
 */
export const inflate = async (
  bytes: Uint8Array<ArrayBuffer>,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const reader = streamOf(bytes)
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Decompressed data exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

/**
 * Encode raw RGBA pixels for a bounding box as deflated base64 (the `rgba-deflate` image encoding).
 *
 * @example
 * const data = await encodeRgbaDeflate(imageData.data, [0, 0, imageData.width, imageData.height]);
 */
export const encodeRgbaDeflate = async (
  rgba: Uint8Array | Uint8ClampedArray,
  coords: BoundingBox,
): Promise<string> => {
  if (rgba.length !== rgbaByteLength(coords)) {
    throw new Error("RGBA data length does not match bounding box size");
  }
  const bytes = new Uint8Array(rgba.length);
  bytes.set(rgba);
  return bytesToBase64(await deflate(bytes));
};

/**
 * Decode `rgba-deflate` base64 data into raw RGBA pixels for a bounding box. Throws if the size does not match exactly.
 *
 * @example
 * const rgba = await decodeRgbaDeflate(message.data, message.coords);
 * const imageData = new ImageData(rgba, width, height);
 */
export const decodeRgbaDeflate = async (
  data: string,
  coords: BoundingBox,
): Promise<Uint8ClampedArray<ArrayBuffer>> => {
  const expected = rgbaByteLength(coords);
  const rgba = await inflate(base64ToBytes(data), expected);
  if (rgba.length !== expected) {
    throw new Error("RGBA data length does not match bounding box size");
  }
  return new Uint8ClampedArray(rgba.buffer);
};
