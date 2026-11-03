// Keeping the user's layers in the browser, so a drawing survives reloading the page (see `LayerAutosave`).
import type { LayerConfig } from "../classes/Layer";

/** Version of a saved drawing's shape, so drawings saved by other versions can be recognised */
export const SAVED_DRAWING_VERSION = 1;

/** Name of the IndexedDB database `IndexedDbLayerStore` keeps drawings in */
export const DATABASE_NAME = "paintcanvas";

/** Version of the database's object stores */
const DATABASE_VERSION = 1;

/** Object store of saved drawings, by name */
const DRAWINGS = "drawings";

/** Object store of layer images (PNG blobs), by drawing name and layer ID */
const IMAGES = "images";

/** A saved layer's settings (its pixels are kept separately, as a PNG) */
export type SavedLayer = Required<LayerConfig>;

/** A saved drawing: its size, its layers (top first) without their pixels, and the selected layer */
export interface SavedDrawing {
  /** The shape's version (see `SAVED_DRAWING_VERSION`) */
  version: number;
  width: number;
  height: number;
  layers: SavedLayer[];
  /** ID of the selected layer */
  activeLayer: string;
}

/** A saved drawing with each layer's pixels as a PNG, by layer ID */
export interface SavedDrawingWithImages {
  drawing: SavedDrawing;
  images: Map<string, Blob>;
}

/** Where a drawing's layers are kept (see `IndexedDbLayerStore`) */
export interface LayerStoreLike {
  /** The drawing's name. Windows using the same name share the drawing, so only one draws at a time. */
  readonly name: string;
  /** The saved drawing, or undefined if none was saved */
  load(): Promise<SavedDrawingWithImages | undefined>;
  /**
   * Save the drawing and the images of the layers that changed (by layer ID). Images of layers no longer in the
   * drawing are deleted.
   */
  save(drawing: SavedDrawing, images: ReadonlyMap<string, Blob>): Promise<void>;
  /** Delete the saved drawing */
  clear(): Promise<void>;
}

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
 * The layer ID in a layer image's key (`[name, layerId]`).
 */
const layerIdOf = (key: IDBValidKey): string => (key as [string, string])[1];

/**
 * Keeps drawings in the browser's IndexedDB database (`DATABASE_NAME`), each under its own name: the drawing in one
 * record, and each layer's pixels as a PNG in its own record, so saving rewrites only the layers that changed.
 *
 * @example
 * const canvas = new PaintCanvas({ layerStore: new IndexedDbLayerStore("my-drawing") });
 */
export default class IndexedDbLayerStore implements LayerStoreLike {
  readonly name: string;

  private readonly factory: IDBFactory;

  private database?: Promise<IDBDatabase>;

  /**
   * @param name - the drawing's name
   * @param factory - the IndexedDB to use (the browser's by default)
   */
  constructor(name: string, factory: IDBFactory = indexedDB) {
    this.name = name;
    this.factory = factory;
  }

  async load(): Promise<SavedDrawingWithImages | undefined> {
    const transaction = (await this.open()).transaction(
      [DRAWINGS, IMAGES],
      "readonly",
    );
    const images = transaction.objectStore(IMAGES);
    const [drawing, keys, blobs] = await Promise.all([
      result<SavedDrawing | undefined>(
        transaction.objectStore(DRAWINGS).get(this.name),
      ),
      result(images.getAllKeys(this.imageKeys())),
      result<Blob[]>(images.getAll(this.imageKeys())),
    ]);
    if (!drawing) return undefined;
    return {
      drawing,
      images: new Map(
        keys.map((key, i) => [layerIdOf(key), blobs[i] as Blob] as const),
      ),
    };
  }

  async save(
    drawing: SavedDrawing,
    images: ReadonlyMap<string, Blob>,
  ): Promise<void> {
    const transaction = (await this.open()).transaction(
      [DRAWINGS, IMAGES],
      "readwrite",
    );
    const done = completed(transaction);
    const store = transaction.objectStore(IMAGES);
    transaction.objectStore(DRAWINGS).put(drawing, this.name);
    for (const [id, image] of images) store.put(image, [this.name, id]);
    // Delete the images of layers that are gone, in the same transaction
    const kept = new Set(drawing.layers.map((layer) => layer.id));
    const keys = store.getAllKeys(this.imageKeys());
    keys.onsuccess = () => {
      for (const key of keys.result)
        if (!kept.has(layerIdOf(key))) store.delete(key);
    };
    await done;
  }

  async clear(): Promise<void> {
    const transaction = (await this.open()).transaction(
      [DRAWINGS, IMAGES],
      "readwrite",
    );
    const done = completed(transaction);
    transaction.objectStore(DRAWINGS).delete(this.name);
    transaction.objectStore(IMAGES).delete(this.imageKeys());
    await done;
  }

  /**
   * Open the database (once), creating its object stores the first time. If it can't be opened, the next call tries
   * again.
   */
  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(DRAWINGS);
        request.result.createObjectStore(IMAGES);
      };
      request.onsuccess = () => {
        const database = request.result;
        // Let another window upgrade the database (this one opens it again when next needed)
        database.onversionchange = () => {
          database.close();
          this.database = undefined;
        };
        resolve(database);
      };
      request.onerror = () => {
        this.database = undefined;
        reject(request.error);
      };
    });
    return this.database;
  }

  /** The keys of this drawing's layer images: `[name, layerId]` (arrays sort after strings) */
  private imageKeys(): IDBKeyRange {
    return IDBKeyRange.bound([this.name], [this.name, []]);
  }
}
