import { describe, it, expect, vi, afterEach } from "vitest";
import RemoteDocumentAutosave, {
  REMOTE_AUTOSAVE_ERROR_EVENT,
  REMOTE_SAVE_INTERVAL_MS,
  type RemoteAutosaveCanvas,
} from "..";
import { MemoryDocumentStore } from "../../../../testing/documentStore";
import type { DrawingDocument } from "../../../document/schema";

/** A canvas whose document is a placeholder, with layers that can be replaced */
const createCanvas = () => {
  const canvas = new EventTarget() as RemoteAutosaveCanvas & {
    layers: EventTarget;
    count: number;
  };
  canvas.layers = new EventTarget();
  canvas.count = 0;
  canvas.createDocument = vi.fn(
    async () => ({ id: `doc-${++canvas.count}` }) as unknown as DrawingDocument,
  );
  return canvas;
};

/** Tell listeners an object changed */
const change = (target: EventTarget) =>
  target.dispatchEvent(new Event("change"));

afterEach(() => {
  vi.useRealTimers();
});

describe("RemoteDocumentAutosave", () => {
  it("should save the whole drawing at most every interval while there are changes", async () => {
    vi.useFakeTimers();
    const canvas = createCanvas();
    const store = new MemoryDocumentStore();
    const autosave = new RemoteDocumentAutosave(canvas, store);
    expect(autosave.store).toBe(store);
    autosave.start();
    autosave.start();
    await vi.advanceTimersByTimeAsync(REMOTE_SAVE_INTERVAL_MS);
    expect(store.saves).toHaveLength(0);
    change(canvas.layers);
    expect(autosave.hasChanges).toBe(true);
    await vi.advanceTimersByTimeAsync(REMOTE_SAVE_INTERVAL_MS - 1);
    expect(store.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.saves).toHaveLength(1);
    expect(autosave.hasChanges).toBe(false);
    expect(autosave.lastSaved).toBeInstanceOf(Date);
    // The canvas's own changes (e.g. its details) count too
    change(canvas);
    await vi.advanceTimersByTimeAsync(REMOTE_SAVE_INTERVAL_MS);
    expect(store.saves).toHaveLength(2);
    autosave.stop();
    change(canvas.layers);
    await vi.advanceTimersByTimeAsync(REMOTE_SAVE_INTERVAL_MS);
    expect(store.saves).toHaveLength(2);
  });

  it("should follow the canvas's new layers", async () => {
    vi.useFakeTimers();
    const canvas = createCanvas();
    const store = new MemoryDocumentStore();
    const autosave = new RemoteDocumentAutosave(canvas, store, {
      intervalMs: 10,
    });
    autosave.start();
    const old = canvas.layers;
    canvas.layers = new EventTarget();
    change(canvas);
    await vi.advanceTimersByTimeAsync(10);
    expect(store.saves).toHaveLength(1);
    change(old);
    await vi.advanceTimersByTimeAsync(10);
    expect(store.saves).toHaveLength(1);
    change(canvas.layers);
    await vi.advanceTimersByTimeAsync(10);
    expect(store.saves).toHaveLength(2);
    autosave.stop();
  });

  it("should save when asked, telling listeners how it's going, one save at a time", async () => {
    const canvas = createCanvas();
    const store = new MemoryDocumentStore();
    const autosave = new RemoteDocumentAutosave(canvas, store);
    const seen: (string | number | undefined)[] = [];
    autosave.addEventListener("change", () =>
      seen.push(autosave.saving ? (autosave.progress ?? "saving") : "done"),
    );
    const first = autosave.save();
    expect(autosave.save()).toBe(first);
    await first;
    expect(seen).toEqual(["saving", 0.25, 0.5, 0.75, 1, "done"]);
    expect(store.saves.map((document) => document.id)).toEqual(["doc-1"]);
    expect(autosave.saving).toBe(false);
  });

  it("should tell listeners when saving fails, and try again with the next save", async () => {
    vi.useFakeTimers();
    const canvas = createCanvas();
    const store = new MemoryDocumentStore();
    vi.spyOn(store, "save").mockRejectedValueOnce(new Error("offline"));
    const autosave = new RemoteDocumentAutosave(canvas, store, {
      intervalMs: 10,
    });
    const errors: unknown[] = [];
    autosave.addEventListener(REMOTE_AUTOSAVE_ERROR_EVENT, (event) =>
      errors.push((event as CustomEvent).detail),
    );
    autosave.start();
    change(canvas.layers);
    await vi.advanceTimersByTimeAsync(10);
    expect((errors[0] as Error).message).toBe("offline");
    expect(autosave.error).toBe(errors[0]);
    expect(autosave.hasChanges).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(autosave.error).toBeUndefined();
    expect(store.saves).toHaveLength(1);
    autosave.stop();
  });
});
