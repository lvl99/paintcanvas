import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryDocumentStore } from "../documentStore";
import type { DrawingDocument } from "../../lib/document/schema";

const document = { id: "a" } as unknown as DrawingDocument;

afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryDocumentStore", () => {
  it("should keep documents by ID, recording each save", async () => {
    const store = new MemoryDocumentStore({ label: "Test" });
    expect(store.label).toBe("Test");
    expect(await store.load("a")).toBeUndefined();
    await store.save(document);
    expect(await store.load("a")).toBe(document);
    expect(store.saves).toEqual([document]);
  });

  it("should take its time when asked, reporting progress", async () => {
    vi.useFakeTimers();
    const store = new MemoryDocumentStore({ delayMs: 400 });
    const progress: number[] = [];
    const saving = store.save(document, (done) => progress.push(done));
    await vi.advanceTimersByTimeAsync(200);
    expect(progress).toEqual([0.25, 0.5]);
    await vi.advanceTimersByTimeAsync(200);
    await saving;
    expect(progress).toEqual([0.25, 0.5, 0.75, 1]);
  });
});
