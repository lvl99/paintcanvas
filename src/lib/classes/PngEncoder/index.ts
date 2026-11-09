/**
 * Encode a canvas as a PNG on the page's own thread (which blocks the page while it runs: seconds on phones for a large
 * canvas).
 *
 * @example
 * const png = await encodePngHere(layer.canvas);
 */
export const encodePngHere = (canvas: OffscreenCanvas): Promise<Blob> => {
  // A canvas that was never drawn on has no context yet, and can't be encoded without one
  canvas.getContext("2d");
  return canvas.convertToBlob({ type: "image/png" });
};

/** The worker's code: draws the image it's sent onto its own canvas and encodes that as a PNG */
export const PNG_WORKER_SOURCE = `self.onmessage = async (event) => {
  const { id, bitmap } = event.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close();
    self.postMessage({ id, blob: await canvas.convertToBlob({ type: "image/png" }) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};`;

/** What the worker sends back: the PNG, or why it couldn't make one */
interface WorkerReply {
  id: number;
  blob?: Blob;
  error?: string;
}

/** Makes the worker, or gives null where workers can't be used */
export type WorkerFactory = () => Worker | null;

/**
 * Make the PNG worker from its code (no separate file, so any bundler works), or null where there are no workers or
 * `createImageBitmap`, or the page doesn't allow workers from `blob:` addresses.
 */
export const createPngWorker: WorkerFactory = () => {
  if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined")
    return null;
  try {
    const url = URL.createObjectURL(
      new Blob([PNG_WORKER_SOURCE], { type: "text/javascript" }),
    );
    return new Worker(url);
  } catch {
    return null;
  }
};

/**
 * Encodes canvases as PNGs in a background worker, so the page keeps responding while large layers are saved. The
 * canvas is copied (`createImageBitmap`) and sent to the worker, which encodes the copy. Where a worker can't be used,
 * or it fails, it encodes on the page's own thread instead (see `encodePngHere`).
 *
 * @example
 * const encoder = new PngEncoder();
 * const png = await encoder.encode(layer.canvas);
 */
export default class PngEncoder {
  private readonly createWorker: WorkerFactory;

  /** The worker, once made (null when it can't be used) */
  private worker?: Worker | null;

  private nextId = 0;

  /** Encodings waiting for the worker, by ID */
  private readonly waiting = new Map<
    number,
    { resolve: (blob: Blob) => void; reject: (error: Error) => void }
  >();

  constructor(createWorker: WorkerFactory = createPngWorker) {
    this.createWorker = createWorker;
  }

  /**
   * Encode a canvas as a PNG, in the worker where it can be used.
   */
  encode = async (canvas: OffscreenCanvas): Promise<Blob> => {
    const worker = this.getWorker();
    if (!worker) return encodePngHere(canvas);
    try {
      canvas.getContext("2d");
      const bitmap = await createImageBitmap(canvas);
      const id = this.nextId++;
      return await new Promise<Blob>((resolve, reject) => {
        this.waiting.set(id, { resolve, reject });
        worker.postMessage({ id, bitmap }, [bitmap]);
      });
    } catch {
      return encodePngHere(canvas);
    }
  };

  /** The worker, made on first use */
  private getWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    const worker = this.createWorker();
    this.worker = worker;
    if (!worker) return null;
    worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
      const { id, blob, error } = event.data;
      const waiting = this.waiting.get(id);
      if (!waiting) return;
      this.waiting.delete(id);
      if (blob) waiting.resolve(blob);
      else waiting.reject(new Error(error));
    });
    // A worker that fails to start (or crashes) isn't used again; what it was encoding is encoded here instead
    worker.addEventListener("error", () => {
      worker.terminate();
      this.worker = null;
      for (const { reject } of this.waiting.values())
        reject(new Error("PNG worker failed"));
      this.waiting.clear();
    });
    return worker;
  }
}
