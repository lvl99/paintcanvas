import type { Asset, AssetAuthor } from "../../assets/schema";
import type { AssetStoreLike } from "../../storage";

/** Event dispatched when loading or saving assets fails (detail: the error) */
export const ASSET_SYNC_ERROR_EVENT = "error";

/** Assets kept in memory that `AssetSync` keeps in a store */
export interface SyncedAssets<T extends Asset<unknown>> extends EventTarget {
  /** The assets, in order (dispatching `change` when they change) */
  readonly items: readonly T[];
  /**
   * Add assets loaded from the store (untrusted: leave out invalid ones, and upgrade older ones, giving those without an
   * author `author`), replacing ones with the same IDs
   */
  merge(items: unknown[], author?: AssetAuthor): void;
}

/**
 * Keeps assets held in memory (e.g. profile graphs) in a store: the saved assets are added when it starts, assets only
 * in memory or changed while added are saved (e.g. ones restored from older app settings, or older saved ones that were
 * upgraded), then each change saves the assets that changed and deletes the ones that are gone.
 *
 * Dispatches an `error` event (with the error as `detail`) when loading or saving fails.
 *
 * @example
 * const sync = new AssetSync(profiles, new IndexedDbAssetStore("profiles"));
 * await sync.ready;
 * sync.stop();
 */
export default class AssetSync<T extends Asset<unknown>> extends EventTarget {
  /** Resolves once the saved assets are loaded and any only in memory are saved */
  readonly ready: Promise<void>;

  /** Each asset as last saved, as JSON, by ID */
  private saved = new Map<string, string>();

  private stopped = false;

  /** Saving, one change after another */
  private saving: Promise<void> = Promise.resolve();

  private readonly onChange = () => {
    this.saving = this.saving.then(() => this.save());
  };

  /**
   * @param assets - the assets in memory
   * @param store - where they're kept
   * @param author - gives the author of older saved assets with none (the user)
   */
  constructor(
    readonly assets: SyncedAssets<T>,
    readonly store: AssetStoreLike<T>,
    readonly author?: () => AssetAuthor,
  ) {
    super();
    this.ready = this.start();
  }

  /**
   * Stop keeping changes (ones already being saved finish).
   */
  stop(): void {
    this.stopped = true;
    this.assets.removeEventListener("change", this.onChange);
  }

  /** Load the saved assets, then save the ones only in memory and listen for changes */
  private async start(): Promise<void> {
    try {
      const listed = await this.store.list();
      if (this.stopped) return;
      this.assets.merge(listed, this.author?.());
      for (const asset of listed)
        if (typeof (asset as Partial<T>)?.id === "string")
          this.saved.set((asset as T).id, JSON.stringify(asset));
    } catch (error) {
      this.fail(error);
    }
    if (this.stopped) return;
    this.assets.addEventListener("change", this.onChange);
    await (this.saving = this.save());
  }

  /** Save the assets that changed since they were last saved, and delete the ones that are gone */
  private async save(): Promise<void> {
    if (this.stopped) return;
    const current = new Map(
      this.assets.items.map((asset) => [asset.id, asset] as const),
    );
    try {
      for (const [id, asset] of current) {
        const json = JSON.stringify(asset);
        if (this.saved.get(id) === json) continue;
        await this.store.put(asset);
        this.saved.set(id, json);
      }
      for (const id of [...this.saved.keys()])
        if (!current.has(id)) {
          await this.store.remove(id);
          this.saved.delete(id);
        }
    } catch (error) {
      this.fail(error);
    }
  }

  /** Tell listeners loading or saving failed */
  private fail(error: unknown): void {
    this.dispatchEvent(
      new CustomEvent(ASSET_SYNC_ERROR_EVENT, { detail: error }),
    );
  }
}
