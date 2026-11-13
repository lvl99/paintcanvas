import { describe, it, expect, vi, afterEach } from "vitest";
import RemoteDocumentAutosave, {
  REMOTE_AUTOSAVE_ERROR_EVENT,
  REMOTE_IDLE_MS,
  REMOTE_SAVE_INTERVAL_MS,
  type RemoteAutosaveCanvas,
} from "..";
import { MemoryDocumentStore } from "../../../../testing/documentStore";
import type { DrawingDocument } from "../../../document/schema";

/** A canvas whose document is a placeholder */
const createCanvas = () => {
  const canvas = new EventTarget() as RemoteAutosaveCanvas & {
    count: number;
  };
  canvas.count = 0;
  canvas.createDocument = vi.fn(
    async () => ({ id: `doc-${++canvas.count}` }) as unknown as DrawingDocument,
  );
  return canvas;
};

/** Tell listeners the drawing changed */
const modify = (target: EventTarget) =>
  target.dispatchEvent(new Event("modified"));

/** A page whose visibility can be changed */
const createPage = () => {
  const page = new EventTarget() as EventTarget & {
    visibilityState: DocumentVisibilityState;
  };
  page.visibilityState = "visible";
  return page;
};

/** Show or hide a page */
const setVisibility = (
  page: ReturnType<typeof createPage>,
  state: DocumentVisibilityState,
) => {
  page.visibilityState = state;
  page.dispatchEvent(new Event("visibilitychange"));
};

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
    expect(autosave.mode).toBe("interval");
    autosave.start();
    autosave.start();
    await vi.advanceTimersByTimeAsync(REMOTE_SAVE_INTERVAL_MS);
    expect(store.saves).toHaveLength(0);
    // Other changes (e.g. choosing a tool) don't count
    canvas.dispatchEvent(new Event("change"));
    await vi.advanceTimersByTimeAsync(REMOTE_SAVE_INTERVAL_MS);
    expect(store.saves).toHaveLength(0);
    modify(canvas);
    expect(autosave.hasChanges).toBe(true);
    await vi.advanceTimersByTimeAsync(REMOTE_SAVE_INTERVAL_MS - 1);
    expect(store.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.saves).toHaveLength(1);
    expect(autosave.hasChanges).toBe(false);
    expect(autosave.lastSaved).toBeInstanceOf(Date);
    autosave.stop();
    modify(canvas);
    await vi.advanceTimersByTimeAsync(REMOTE_SAVE_INTERVAL_MS);
    expect(store.saves).toHaveLength(1);
  });

  it("should save once the drawing goes unchanged, in idle mode", async () => {
    vi.useFakeTimers();
    const canvas = createCanvas();
    const store = new MemoryDocumentStore();
    const autosave = new RemoteDocumentAutosave(canvas, store, {
      mode: "idle",
      document: null,
      window: null,
    });
    expect(autosave.mode).toBe("idle");
    autosave.start();
    await vi.advanceTimersByTimeAsync(REMOTE_IDLE_MS);
    expect(store.saves).toHaveLength(0);
    modify(canvas);
    await vi.advanceTimersByTimeAsync(REMOTE_IDLE_MS - 1);
    // Drawing again waits again
    modify(canvas);
    await vi.advanceTimersByTimeAsync(REMOTE_IDLE_MS - 1);
    expect(store.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.saves).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(REMOTE_IDLE_MS * 2);
    expect(store.saves).toHaveLength(1);
    modify(canvas);
    autosave.stop();
    await vi.advanceTimersByTimeAsync(REMOTE_IDLE_MS);
    expect(store.saves).toHaveLength(1);
  });

  it("should save changes when the page is hidden or the window loses focus, in idle mode", async () => {
    const canvas = createCanvas();
    const store = new MemoryDocumentStore();
    const page = createPage();
    const view = new EventTarget();
    const autosave = new RemoteDocumentAutosave(canvas, store, {
      mode: "idle",
      idleMs: 60_000,
      document: page,
      window: view,
    });
    autosave.start();
    setVisibility(page, "hidden");
    view.dispatchEvent(new Event("blur"));
    expect(autosave.saving).toBe(false);
    modify(canvas);
    setVisibility(page, "visible");
    expect(autosave.saving).toBe(false);
    setVisibility(page, "hidden");
    await vi.waitFor(() => expect(store.saves).toHaveLength(1));
    modify(canvas);
    view.dispatchEvent(new Event("blur"));
    await vi.waitFor(() => expect(store.saves).toHaveLength(2));
    autosave.stop();
    modify(canvas);
    view.dispatchEvent(new Event("blur"));
    setVisibility(page, "hidden");
    expect(autosave.saving).toBe(false);
  });

  it("should save changes made while saving once the drawing goes unchanged again, in idle mode", async () => {
    vi.useFakeTimers();
    const canvas = createCanvas();
    const store = new MemoryDocumentStore({ delayMs: 100 });
    const autosave = new RemoteDocumentAutosave(canvas, store, {
      mode: "idle",
      idleMs: 10,
    });
    autosave.start();
    const saving = autosave.save();
    modify(canvas);
    await vi.advanceTimersByTimeAsync(10);
    expect(store.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(90);
    await saving;
    expect(store.saves).toHaveLength(1);
    expect(autosave.hasChanges).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(autosave.saving).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.saves).toHaveLength(2);
    autosave.stop();
  });

  it("should use the page's document and window by default", () => {
    const autosave = new RemoteDocumentAutosave(
      createCanvas(),
      new MemoryDocumentStore(),
      { mode: "idle" },
    );
    const add = vi.spyOn(document, "addEventListener");
    const addWindow = vi.spyOn(window, "addEventListener");
    autosave.start();
    expect(add).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(addWindow).toHaveBeenCalledWith("blur", expect.any(Function));
    autosave.stop();
    add.mockRestore();
    addWindow.mockRestore();
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
    modify(canvas);
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
