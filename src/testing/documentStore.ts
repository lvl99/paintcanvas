import type { DocumentStoreLike } from "../lib/storage";
import type { DrawingDocument } from "../lib/document/schema";

/** Options for `MemoryDocumentStore` */
export interface MemoryDocumentStoreOptions {
  /** Names the store for the user */
  label?: string;
  /** How long each save takes (milliseconds), reporting progress in 4 steps, e.g. to try out a saving indicator */
  delayMs?: number;
}

/**
 * A document store kept in memory (e.g. for tests, or to try out remote saving), recording each save.
 *
 * @example
 * canvas.useRemoteDocumentStore(new MemoryDocumentStore({ label: "Test", delayMs: 2000 }));
 */
export class MemoryDocumentStore implements DocumentStoreLike {
  readonly label?: string;

  /** The saved documents, by ID */
  readonly documents = new Map<string, DrawingDocument>();

  /** Each save, in order */
  readonly saves: DrawingDocument[] = [];

  private readonly delayMs: number;

  constructor({ label, delayMs = 0 }: MemoryDocumentStoreOptions = {}) {
    this.label = label;
    this.delayMs = delayMs;
  }

  async save(
    document: DrawingDocument,
    onProgress?: (done: number) => void,
  ): Promise<void> {
    for (let step = 1; step <= 4; step++) {
      if (this.delayMs > 0)
        await new Promise((resolve) => setTimeout(resolve, this.delayMs / 4));
      onProgress?.(step / 4);
    }
    this.saves.push(document);
    this.documents.set(document.id, document);
  }

  async load(id: string): Promise<DrawingDocument | undefined> {
    return this.documents.get(id);
  }
}
