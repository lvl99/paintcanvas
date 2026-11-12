import { css, html } from "lit";
import { live } from "lit/directives/live.js";
import { PcElement, defineElement, emit } from "../../base";
import { askConfirm, askText, type ConfirmFn, type PromptFn } from "../../ask";
import "../PcDialogWindow";
import "../PcProfileGraph";
import "../PcContextMenu";
import "../PcButton";
import type { MenuItem } from "../PcMenu";
import ProfileGraphs from "../../../lib/classes/ProfileGraphs";
import type { AssetAuthor } from "../../../lib/assets/schema";
import {
  linearPoints,
  samePoints,
  type ProfilePoint,
} from "../../../lib/profiles";

/** What the editor's `pc-save` gives: the points to use and the graph they came from (undefined for an unsaved one) */
export interface ProfileSaveDetail {
  points: ProfilePoint[];
  profileId?: string;
}

/** The value of the drop-down's "Custom" option */
const CUSTOM = "";

/**
 * A window for editing a brush setting's profile graph (see `<pc-profile-graph>`): a drop-down of the presets and the
 * user's own graphs (it says "Custom" once the graph is edited, or for one that isn't saved), a ⋮ menu (New graph,
 * Duplicate…, Rename… and Delete…, the last two for the user's own graphs), the graph, and Save, Reset and Dismiss.
 *
 * - Choosing a graph in the drop-down loads its points.
 * - New graph starts from a straight line, and Duplicate… saves a copy of the current graph under a name ("Custom" to
 *   start with); Rename… and Delete… ask first.
 * - Save uses the graph (firing `pc-save` with its points and ID); an edited or unsaved graph is first saved with a name
 *   it asks for, asking before replacing another of the user's graphs with that name.
 * - Reset goes back to the graph it opened with; Dismiss, ⨉ and Escape close it (`pc-close`) without changing anything.
 *
 * Graphs are saved in `profiles` (the canvas's `ProfileGraphs`).
 *
 * @example
 * html`<pc-profile-editor .profiles=${app.profiles} .author=${app.author} .points=${points} profile-id="overweight" label="Width"
 *   @pc-save=${(e) => use(e.detail)} @pc-close=${close}></pc-profile-editor>`
 */
export class PcProfileEditor extends PcElement {
  static override properties = {
    ...PcElement.properties,
    profiles: { attribute: false },
    author: { attribute: false },
    points: { attribute: false },
    profileId: { type: String, attribute: "profile-id" },
    label: { type: String },
    draft: { state: true },
    sourceId: { state: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: contents;
      }
      pc-dialog-window {
        --pc-dialog-width: 340px;
      }
      .choose {
        display: flex;
        align-items: center;
        gap: var(--pc-space-2);
        width: 100%;
      }
      select {
        flex: 1;
        min-width: 0;
        min-height: var(--pc-control-size);
        padding: 0 var(--pc-space-2);
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface);
        color: var(--pc-text);
        font: inherit;
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-2);
      }
    `,
  ];

  /** Where graphs are saved (the canvas's `ProfileGraphs`) */
  declare profiles: ProfileGraphs;

  /** The author of graphs saved as new ones (the canvas's `author`; `UNKNOWN_AUTHOR` if not given) */
  declare author?: AssetAuthor;

  /** The points it opens with */
  declare points?: ProfilePoint[];

  /** The ID of the graph it opens with, if it's one of the presets or saved graphs */
  declare profileId?: string;

  /** The setting's name, e.g. "Width" */
  declare label: string;

  /** The points being edited */
  declare draft: ProfilePoint[];

  /** The graph the points came from, until they're edited */
  declare sourceId?: string;

  /** Asks the user to confirm, in a dialog (replaceable for tests) */
  confirm: ConfirmFn = (options) => askConfirm(this.renderRoot, options);

  /** Asks the user for text, in a dialog (replaceable for tests) */
  prompt: PromptFn = (options) => askText(this.renderRoot, options);

  constructor() {
    super();
    this.profiles = new ProfileGraphs();
    this.label = "";
    this.draft = linearPoints();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has("points") || changed.has("profileId")) this.reset();
  }

  /** Go back to the graph it opened with */
  reset(): void {
    this.draft = structuredClone(this.points ?? linearPoints());
    const source = this.profiles.get(this.profileId);
    this.sourceId =
      source && samePoints(source.content.points, this.draft)
        ? source.id
        : undefined;
  }

  /** Load a graph's points */
  load(id: string): void {
    const graph = this.profiles.get(id);
    if (!graph) return;
    this.draft = structuredClone(graph.content.points);
    this.sourceId = graph.id;
  }

  /** Whether the graph being edited is one of the user's own, unchanged */
  private get ownSource(): boolean {
    return (
      this.sourceId !== undefined && !this.profiles.isPreset(this.sourceId)
    );
  }

  /**
   * Ask for a name and save the points as one of the user's graphs, asking before replacing another with that name.
   * Returns the saved graph's ID, or undefined if it wasn't saved.
   */
  private async saveAs(value: string): Promise<string | undefined> {
    const name = (
      await this.prompt({
        heading: this.t("paintCanvas.profileEditor.saveHeading"),
        label: this.t("paintCanvas.profileEditor.name"),
        value,
        confirm: this.t("paintCanvas.common.save"),
        cancel: this.t("paintCanvas.common.cancel"),
      })
    )?.trim();
    if (!name) return undefined;
    const existing = this.profiles.findByName(name);
    if (
      existing &&
      !(await this.confirm({
        heading: this.t("paintCanvas.profileEditor.replaceHeading"),
        message: this.t("paintCanvas.profileEditor.replaceConfirm", { name }),
        confirm: this.t("paintCanvas.presets.replace"),
        cancel: this.t("paintCanvas.common.cancel"),
        cancelling: true,
      }))
    )
      return undefined;
    const saved = this.profiles.save({
      id: existing?.id,
      name,
      // A replaced graph keeps its author
      author: existing?.author ?? this.author,
      points: this.draft,
    });
    if (saved) this.sourceId = saved.id;
    return saved?.id;
  }

  /**
   * Use the graph: save it first when it's edited or unsaved (asking for a name), then fire `pc-save`.
   */
  async save(): Promise<void> {
    const id =
      this.sourceId ??
      (await this.saveAs(this.t("paintCanvas.profileEditor.custom")));
    if (!id) return;
    emit<ProfileSaveDetail>(this, "pc-save", {
      points: structuredClone(this.draft),
      profileId: id,
    });
  }

  /** Do one of the ⋮ menu's actions */
  async act(action: string): Promise<void> {
    const graph = this.profiles.get(this.sourceId);
    if (action === "new") {
      this.draft = linearPoints();
      this.sourceId = undefined;
    } else if (action === "duplicate") {
      await this.saveAs(this.t("paintCanvas.profileEditor.custom"));
    } else if (action === "rename" && graph && this.ownSource) {
      const name = await this.prompt({
        heading: this.t("paintCanvas.profileEditor.renameHeading"),
        label: this.t("paintCanvas.profileEditor.name"),
        value: graph.name,
        confirm: this.t("paintCanvas.common.save"),
        cancel: this.t("paintCanvas.common.cancel"),
      });
      if (name && this.profiles.rename(graph.id, name)) this.requestUpdate();
    } else if (action === "delete" && graph && this.ownSource) {
      const confirmed = await this.confirm({
        heading: this.t("paintCanvas.profileEditor.deleteHeading"),
        message: this.t("paintCanvas.profileEditor.deleteConfirm", {
          name: graph.name,
        }),
        confirm: this.t("paintCanvas.common.delete"),
        cancel: this.t("paintCanvas.common.cancel"),
        cancelling: true,
      });
      if (confirmed && this.profiles.remove(graph.id))
        this.sourceId = undefined;
    }
  }

  /** A graph's name: the presets' in the chosen language */
  private graphName(id: string, name: string): string {
    return this.profiles.isPreset(id)
      ? this.t(`paintCanvas.profiles.${id}`)
      : name;
  }

  override render() {
    const own = this.ownSource;
    const items: MenuItem[] = [
      { value: "new", label: this.t("paintCanvas.profileEditor.new") },
      {
        value: "duplicate",
        label: this.t("paintCanvas.profileEditor.duplicate"),
      },
      {
        value: "rename",
        label: this.t("paintCanvas.profileEditor.rename"),
        disabled: !own,
      },
      {
        value: "delete",
        label: this.t("paintCanvas.profileEditor.delete"),
        disabled: !own,
        danger: true,
      },
    ];
    const title = this.t("paintCanvas.profileEditor.title", {
      param: this.label,
    });
    return html`<pc-dialog-window
      open
      shaded
      label=${title}
      @pc-dismiss=${(event: Event) => {
        event.preventDefault();
        emit(this, "pc-close");
      }}
    >
      <div slot="header-middle" class="choose">
        <select
          aria-label=${title}
          .value=${live(this.sourceId ?? CUSTOM)}
          @change=${(event: Event) =>
            this.load((event.target as HTMLSelectElement).value)}
        >
          ${
            this.sourceId === undefined
              ? html`<option value=${CUSTOM}>
                  ${this.t("paintCanvas.profileEditor.custom")}
                </option>`
              : ""
          }
          ${this.profiles.all.map(
            (graph) =>
              html`<option
                value=${graph.id}
                .selected=${graph.id === this.sourceId}
              >
                ${this.graphName(graph.id, graph.name)}
              </option>`,
          )}
        </select>
        <pc-context-menu
          label=${this.t("paintCanvas.profileEditor.actions")}
          .items=${items}
          @pc-select=${(event: CustomEvent<{ value: string }>) =>
            void this.act(event.detail.value)}
        ></pc-context-menu>
      </div>
      <pc-profile-graph
        slot="body"
        label=${title}
        .points=${this.draft}
        @pc-change=${(event: CustomEvent<{ points: ProfilePoint[] }>) => {
          this.draft = event.detail.points;
          this.sourceId = undefined;
        }}
      ></pc-profile-graph>
      <div slot="footer-middle" class="actions">
        <pc-button class="save" @click=${() => void this.save()}>
          ${this.t("paintCanvas.common.save")}
        </pc-button>
        <pc-button class="reset" variant="cancel" @click=${() => this.reset()}>
          ${this.t("paintCanvas.profileEditor.reset")}
        </pc-button>
        <pc-button
          class="dismiss"
          variant="dismiss"
          @click=${() => emit(this, "pc-close")}
        >
          ${this.t("paintCanvas.common.dismiss")}
        </pc-button>
      </div>
    </pc-dialog-window>`;
  }
}

defineElement("pc-profile-editor", PcProfileEditor);
