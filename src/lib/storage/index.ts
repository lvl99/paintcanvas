// Keeping the user's layers in the browser, so a drawing survives reloading the page (see `LayerAutosave`), the
// user's app settings (see `SettingsAutosave`) and their assets: brush presets, colour palettes and profile graphs.
import type { LayerConfig } from "../classes/Layer";
import type { AppSettings } from "../settings/schema";
import type { Asset } from "../assets/schema";
import type { BrushPreset } from "../brushes/types";
import type { ColourPalette } from "../palette/schema";
import type { ProfileGraph } from "../profiles";
import type { DocumentInfo, DrawingDocument } from "../document/schema";
import { isRendering, type Rendering } from "../classes/UiSettings";

/** Version of a saved drawing's shape, so drawings saved by other versions can be recognised */
export const SAVED_DRAWING_VERSION = 1;

/** Name of the IndexedDB database `IndexedDbLayerStore` keeps drawings in, and `IndexedDbSettingsStore` settings */
export const DATABASE_NAME = "paintcanvas";

/** Version of the database's object stores (2 added settings; 3 added brushes, palettes and profiles) */
export const DATABASE_VERSION = 3;

/** Object store of saved drawings, by name */
const DRAWINGS = "drawings";

/** Object store of layer images (PNG blobs), by drawing name and layer ID */
const IMAGES = "images";

/** Object store of app settings, by name */
const SETTINGS = "settings";

/** Kinds of asset kept in the database, each in its own object store, by settings name and asset ID */
export const ASSET_KINDS = ["brushes", "palettes", "profiles"] as const;

/** A kind of asset kept in the database */
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Every object store, created when the database is first opened or upgraded */
const OBJECT_STORES = [DRAWINGS, IMAGES, SETTINGS, ...ASSET_KINDS] as const;

/** A saved layer's settings (its pixels are kept separately, as a PNG) */
export type SavedLayer = Required<LayerConfig>;

/** A saved drawing: its details, size, its layers (top first) without their pixels, and the selected layer */
export interface SavedDrawing {
  /** The shape's version (see `SAVED_DRAWING_VERSION`) */
  version: number;
  /** The drawing's details (drawings saved by older versions have none) */
  document?: DocumentInfo;
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
 * Open PaintCanvas's database, creating the object stores it doesn't have yet. When another window upgrades the
 * database, this connection closes and `onClose` is called, so the next use opens it again.
 */
const openDatabase = (
  factory: IDBFactory,
  onClose: () => void,
): Promise<IDBDatabase> =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of OBJECT_STORES)
        if (!database.objectStoreNames.contains(store))
          database.createObjectStore(store);
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        onClose();
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  });

/**
 * Opens PaintCanvas's database once and keeps the connection, opening it again if it closes or fails to open.
 */
class DatabaseConnection {
  private database?: Promise<IDBDatabase>;

  constructor(private readonly factory: IDBFactory) {}

  /** The open database */
  open(): Promise<IDBDatabase> {
    this.database ??= openDatabase(this.factory, () => {
      this.database = undefined;
    }).catch((error: unknown) => {
      this.database = undefined;
      throw error;
    });
    return this.database;
  }
}

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

  private readonly connection: DatabaseConnection;

  /**
   * @param name - the drawing's name
   * @param factory - the IndexedDB to use (the browser's by default)
   */
  constructor(name: string, factory: IDBFactory = indexedDB) {
    this.name = name;
    this.connection = new DatabaseConnection(factory);
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
   * Open the database (once). If it can't be opened, the next call tries again.
   */
  private open(): Promise<IDBDatabase> {
    return this.connection.open();
  }

  /** The keys of this drawing's layer images: `[name, layerId]` (arrays sort after strings) */
  private imageKeys(): IDBKeyRange {
    return IDBKeyRange.bound([this.name], [this.name, []]);
  }
}

/** Where the user's app settings are kept (see `IndexedDbSettingsStore`) */
export interface SettingsStoreLike {
  /** The settings' name, e.g. to keep settings for different apps apart */
  readonly name: string;
  /** The saved settings (untrusted: check them before using them), or undefined if none were saved */
  load(): Promise<unknown>;
  /** Save the settings */
  save(settings: AppSettings): Promise<void>;
}

/** Name the app settings are kept under when none is given */
export const DEFAULT_SETTINGS_NAME = "default";

/**
 * Keeps the user's app settings (see `AppSettings`) in the browser's IndexedDB database (`DATABASE_NAME`), under a
 * name.
 *
 * @example
 * const store = new IndexedDbSettingsStore();
 * await store.save(collectSettings(canvas));
 */
export class IndexedDbSettingsStore implements SettingsStoreLike {
  readonly name: string;

  private readonly connection: DatabaseConnection;

  /**
   * @param name - the settings' name (`DEFAULT_SETTINGS_NAME` by default)
   * @param factory - the IndexedDB to use (the browser's by default)
   */
  constructor(
    name: string = DEFAULT_SETTINGS_NAME,
    factory: IDBFactory = indexedDB,
  ) {
    this.name = name;
    this.connection = new DatabaseConnection(factory);
  }

  async load(): Promise<unknown> {
    const database = await this.connection.open();
    return result(
      database
        .transaction(SETTINGS, "readonly")
        .objectStore(SETTINGS)
        .get(this.name),
    );
  }

  async save(settings: AppSettings): Promise<void> {
    const transaction = (await this.connection.open()).transaction(
      SETTINGS,
      "readwrite",
    );
    const done = completed(transaction);
    transaction.objectStore(SETTINGS).put(settings, this.name);
    await done;
  }
}

/** Where assets of one kind (e.g. brush presets) are kept (see `IndexedDbAssetStore`) */
export interface AssetStoreLike<T extends Asset<unknown>> {
  /** The saved assets (untrusted: check them before using them), in the order they were first saved */
  list(): Promise<unknown[]>;
  /** Save an asset, replacing one with the same ID */
  put(asset: T): Promise<void>;
  /** Delete an asset */
  remove(id: string): Promise<void>;
}

/** The order of the asset last saved for the first time */
let lastOrder = 0;

/**
 * The order of an asset saved for the first time: when it was saved, and always after the one before.
 */
const nextOrder = (): number =>
  (lastOrder = Math.max(Date.now(), lastOrder + 1));

/** A saved asset, with when it was first saved to keep them in order */
interface AssetRecord {
  asset: unknown;
  order: number;
}

/**
 * Keeps assets of one kind (e.g. brush presets) in the browser's IndexedDB database (`DATABASE_NAME`), under a name
 * (like `IndexedDbSettingsStore`'s), each in its own record so saving one doesn't rewrite the others.
 *
 * @example
 * const store = new IndexedDbAssetStore<BrushPreset>("brushes");
 * await store.put(myPreset);
 */
export class IndexedDbAssetStore<
  T extends Asset<unknown>,
> implements AssetStoreLike<T> {
  readonly kind: AssetKind;

  readonly name: string;

  private readonly connection: DatabaseConnection;

  /**
   * @param kind - the kind of asset
   * @param name - the settings' name the assets belong to (`DEFAULT_SETTINGS_NAME` by default)
   * @param factory - the IndexedDB to use (the browser's by default)
   */
  constructor(
    kind: AssetKind,
    name: string = DEFAULT_SETTINGS_NAME,
    factory: IDBFactory = indexedDB,
  ) {
    this.kind = kind;
    this.name = name;
    this.connection = new DatabaseConnection(factory);
  }

  async list(): Promise<unknown[]> {
    const records = await result<AssetRecord[]>(
      (await this.connection.open())
        .transaction(this.kind, "readonly")
        .objectStore(this.kind)
        .getAll(this.keys()),
    );
    return records
      .sort((a, b) => a.order - b.order)
      .map((record) => record.asset);
  }

  async put(asset: T): Promise<void> {
    const transaction = (await this.connection.open()).transaction(
      this.kind,
      "readwrite",
    );
    const done = completed(transaction);
    const store = transaction.objectStore(this.kind);
    const key = [this.name, asset.id];
    // A replaced asset keeps its place
    const existing = store.get(key);
    existing.onsuccess = () => {
      const order =
        (existing.result as AssetRecord | undefined)?.order ?? nextOrder();
      store.put({ asset, order } satisfies AssetRecord, key);
    };
    await done;
  }

  async remove(id: string): Promise<void> {
    const transaction = (await this.connection.open()).transaction(
      this.kind,
      "readwrite",
    );
    const done = completed(transaction);
    transaction.objectStore(this.kind).delete([this.name, id]);
    await done;
  }

  /** The keys of this name's assets: `[name, id]` (arrays sort after strings) */
  private keys(): IDBKeyRange {
    return IDBKeyRange.bound([this.name], [this.name, []]);
  }
}

/**
 * Where whole documents are kept away from the browser, e.g. a user's account online (see `RemoteDocumentAutosave`).
 * Saving can be slow, so it's done less often than keeping the drawing in the browser.
 */
export interface DocumentStoreLike {
  /** Names the store for the user, e.g. "Bluesky" (shown while saving) */
  readonly label?: string;
  /**
   * Save a document, replacing the one with the same ID. Call `onProgress` with how much is done (0 to 1), if known.
   */
  save(
    document: DrawingDocument,
    onProgress?: (done: number) => void,
  ): Promise<void>;
  /** A saved document by ID, or undefined if there's none */
  load(id: string): Promise<DrawingDocument | undefined>;
}

/** Where the user's assets are kept, by kind. Assets of a kind without a store are kept in memory only. */
export interface AssetStores {
  brushes?: AssetStoreLike<BrushPreset>;
  palettes?: AssetStoreLike<ColourPalette>;
  profiles?: AssetStoreLike<ProfileGraph>;
}

/** Where the user's settings and assets are kept */
export interface PaintCanvasStores extends AssetStores {
  settings?: SettingsStoreLike;
}

/**
 * Stores keeping the user's settings and assets in the browser's IndexedDB database, under a name.
 *
 * @example
 * const { settings, ...assets } = indexedDbStores("my-app");
 * canvas.useAssetStores(assets);
 */
export const indexedDbStores = (
  name: string = DEFAULT_SETTINGS_NAME,
  factory: IDBFactory = indexedDB,
): Required<PaintCanvasStores> => ({
  settings: new IndexedDbSettingsStore(name, factory),
  brushes: new IndexedDbAssetStore("brushes", name, factory),
  palettes: new IndexedDbAssetStore("palettes", name, factory),
  profiles: new IndexedDbAssetStore("profiles", name, factory),
});

/**
 * The browser storage key that keeps the rendering chosen with the app settings of a name (see
 * `loadRenderingChoice`).
 *
 * @example
 * renderingChoiceKey("demo"); // "paintcanvas-rendering:demo"
 */
export const renderingChoiceKey = (name: string): string =>
  `${DATABASE_NAME}-rendering:${name}`;

/**
 * The rendering (`cpu` or `gpu`) last chosen with the app settings of a name, kept in `localStorage` so it can be read
 * before the canvas is made (the app settings themselves load later, from IndexedDB). Undefined when none was kept, it
 * isn't valid, or the storage can't be read (e.g. blocked by the browser).
 *
 * @example
 * new PaintCanvas({ rendering: loadRenderingChoice("demo") });
 */
export const loadRenderingChoice = (
  name: string = DEFAULT_SETTINGS_NAME,
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): Rendering | undefined => {
  try {
    const value = storage?.getItem(renderingChoiceKey(name));
    return isRendering(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Keep the rendering chosen with the app settings of a name, to be read with `loadRenderingChoice` when the canvas is
 * next made. Does nothing if the storage can't be written.
 *
 * @example
 * canvas.ui.addEventListener("change", () => saveRenderingChoice("demo", canvas.ui.data.rendering));
 */
export const saveRenderingChoice = (
  name: string,
  rendering: Rendering,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void => {
  try {
    storage?.setItem(renderingChoiceKey(name), rendering);
  } catch {
    // The choice is still kept with the app settings
  }
};
