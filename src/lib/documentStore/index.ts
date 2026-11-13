// An optional document store that keeps whole documents in the browser's IndexedDB, and lists them without loading
// their layers (e.g. for an "Open document" list). Import it from `@lvl99dotcom/paintcanvas/lib/documentStore`.
import type { DocumentStoreLike } from "../storage";
import type {
  DocumentInfo,
  DocumentThumbnail,
  DrawingDocument,
} from "../document/schema";

/** Name of the IndexedDB database `IndexedDbDocumentStore` keeps documents in */
export const DOCUMENT_DATABASE_NAME = "paintcanvas-documents";

/** Version of the document database's object stores */
export const DOCUMENT_DATABASE_VERSION = 1;

/** Name the documents are kept under when none is given */
export const DEFAULT_DOCUMENT_STORE_NAME = "default";

/** Object store of whole documents, by store name and document ID */
const DOCUMENTS = "documents";

/** Object store of document summaries, by store name and document ID */
const SUMMARIES = "summaries";

/** A saved document in short, to list it without loading its layers: its details, size and thumbnail */
export interface DocumentSummary extends DocumentInfo {
  width: number;
  height: number;
  thumbnail?: DocumentThumbnail<Blob>;
}

/** A document store that can also list, remove and mark documents opened (see `IndexedDbDocumentStore`) */
export interface DocumentListStoreLike extends DocumentStoreLike {
  /** The saved documents in short, most recently opened first */
  list(): Promise<DocumentSummary[]>;
  /** Delete a saved document */
  remove(id: string): Promise<void>;
  /** Mark a saved document opened at a time (now by default), without counting it as changed (`updatedAt`) */
  markOpened(id: string, date?: Date): Promise<void>;
}

/** Options for `IndexedDbDocumentStore` */
export interface IndexedDbDocumentStoreOptions {
  /** Names the store for the user (shown while saving) */
  label?: string;
  /** The IndexedDB to use (the browser's by default) */
  factory?: IDBFactory;
}

/**
 * A document in short (see `DocumentSummary`).
 *
 * @example
 * summarise(await canvas.createDocument()); // { id, name, author, dateCreated, dateOpened, updatedAt, width, height, thumbnail }
 */
export const summarise = (document: DrawingDocument): DocumentSummary => {
  const { layers, external, activeLayer, ...summary } = document;
  void layers;
  void external;
  void activeLayer;
  return summary;
};

/**
 * Wait for an IndexedDB request's result.
 */
const result = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * Wait for an IndexedDB transaction to finish, failing if it's aborted.
 */
const completed = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Transaction aborted"));
  });

/**
 * Keeps whole documents in the browser's IndexedDB database (`DOCUMENT_DATABASE_NAME`), under a name (e.g. to keep
 * each user's apart): each document in one record, and its summary in another, so they can be listed without loading
 * their layers.
 *
 * @example
 * const store = new IndexedDbDocumentStore("ada.example", { label: "This browser" });
 * await store.save(await canvas.createDocument());
 * const [latest] = await store.list();
 * await canvas.openDocument((await store.load(latest.id))!);
 * await store.markOpened(latest.id);
 */
export default class IndexedDbDocumentStore implements DocumentListStoreLike {
  readonly name: string;

  readonly label?: string;

  private readonly factory: IDBFactory;

  private database?: Promise<IDBDatabase>;

  /**
   * @param name - the name the documents are kept under (`DEFAULT_DOCUMENT_STORE_NAME` by default)
   */
  constructor(
    name: string = DEFAULT_DOCUMENT_STORE_NAME,
    { label, factory = indexedDB }: IndexedDbDocumentStoreOptions = {},
  ) {
    this.name = name;
    this.label = label;
    this.factory = factory;
  }

  async save(
    document: DrawingDocument,
    onProgress?: (done: number) => void,
  ): Promise<void> {
    const transaction = this.transaction(await this.open(), "readwrite");
    const done = completed(transaction);
    const key = this.key(document.id);
    transaction.objectStore(DOCUMENTS).put(document, key);
    transaction.objectStore(SUMMARIES).put(summarise(document), key);
    await done;
    onProgress?.(1);
  }

  async load(id: string): Promise<DrawingDocument | undefined> {
    const transaction = this.transaction(await this.open(), "readonly");
    return result<DrawingDocument | undefined>(
      transaction.objectStore(DOCUMENTS).get(this.key(id)),
    );
  }

  async list(): Promise<DocumentSummary[]> {
    const transaction = this.transaction(await this.open(), "readonly");
    const summaries = await result<DocumentSummary[]>(
      transaction
        .objectStore(SUMMARIES)
        .getAll(IDBKeyRange.bound([this.name], [this.name, []])),
    );
    // ISO 8601 times in UTC sort as text
    return summaries.sort((a, b) => b.dateOpened.localeCompare(a.dateOpened));
  }

  async remove(id: string): Promise<void> {
    const transaction = this.transaction(await this.open(), "readwrite");
    const done = completed(transaction);
    transaction.objectStore(DOCUMENTS).delete(this.key(id));
    transaction.objectStore(SUMMARIES).delete(this.key(id));
    await done;
  }

  async markOpened(id: string, date: Date = new Date()): Promise<void> {
    const transaction = this.transaction(await this.open(), "readwrite");
    const done = completed(transaction);
    const dateOpened = date.toISOString();
    const key = this.key(id);
    for (const name of [DOCUMENTS, SUMMARIES]) {
      const store = transaction.objectStore(name);
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result)
          store.put({ ...request.result, dateOpened } as DocumentInfo, key);
      };
    }
    await done;
  }

  /** A document's key: `[name, id]` */
  private key(id: string): [string, string] {
    return [this.name, id];
  }

  /** A transaction on both object stores */
  private transaction(
    database: IDBDatabase,
    mode: IDBTransactionMode,
  ): IDBTransaction {
    return database.transaction([DOCUMENTS, SUMMARIES], mode);
  }

  /**
   * Open the database once, creating its object stores. If it can't be opened, or another window upgrades it, the next
   * use opens it again.
   */
  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(
        DOCUMENT_DATABASE_NAME,
        DOCUMENT_DATABASE_VERSION,
      );
      request.onupgradeneeded = () => {
        // Version 1 is the only version so far: it has neither
        for (const name of [DOCUMENTS, SUMMARIES])
          request.result.createObjectStore(name);
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.database = undefined;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error);
    }).catch((error: unknown) => {
      this.database = undefined;
      throw error;
    });
    return this.database;
  }
}
