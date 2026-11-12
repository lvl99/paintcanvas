import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import type { PcProfileEditor, ProfileSaveDetail } from "..";
import type { PcDialogWindow } from "../../PcDialogWindow";
import type { PcProfileGraph } from "../../PcProfileGraph";
import type { PcContextMenu } from "../../PcContextMenu";
import type { MenuItem } from "../../PcMenu";
import type { PcDialog } from "../../PcDialog";
import { CANCEL_CHOICE } from "../../PcDialog";
import { OK_CHOICE } from "../../../ask";
import ProfileGraphs from "../../../../lib/classes/ProfileGraphs";
import {
  PROFILE_PRESETS,
  linearPoints,
  type ProfilePoint,
} from "../../../../lib/profiles";
import { events, mount, query, queryAll } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

/** Overweight's points */
const curved = () =>
  PROFILE_PRESETS[1]!.content.points.map((point) => ({ ...point }));

/** An editor for the width, with the user's graphs, answering prompts and confirmations as given */
const setup = async (properties: Partial<PcProfileEditor> = {}) => {
  const profiles = new ProfileGraphs();
  const element = await mount<PcProfileEditor>("pc-profile-editor", {
    profiles,
    label: "Width",
    ...properties,
  });
  element.prompt = vi.fn(() => "Soft");
  element.confirm = vi.fn(() => true);
  const saves = events<ProfileSaveDetail>(element, "pc-save");
  const closes = events(element, "pc-close");
  const select = () => query<HTMLSelectElement>(element, "select");
  const options = () =>
    [...select().options].map((option) => [
      option.value,
      option.textContent?.trim(),
    ]);
  const graph = () => query<PcProfileGraph>(element, "pc-profile-graph");
  const edit = async (points: ProfilePoint[]) => {
    graph().dispatchEvent(new CustomEvent("pc-change", { detail: { points } }));
    await element.updateComplete;
  };
  return { profiles, element, saves, closes, select, options, graph, edit };
};

describe("pc-profile-editor", () => {
  it("should show a shaded window with the graph, the drop-down, a menu, and Save, Reset and Dismiss", async () => {
    const { element, options, select, graph } = await setup({
      profileId: "linear",
    });
    const window = query<PcDialogWindow>(element, "pc-dialog-window");
    expect([window.open, window.shaded, window.label]).toEqual([
      true,
      true,
      "Width profile graph",
    ]);
    expect(options()).toEqual([
      ["linear", "Linear"],
      ["overweight", "Overweight"],
      ["underweight", "Underweight"],
    ]);
    expect(select().value).toBe("linear");
    expect(graph().points).toEqual(linearPoints());
    expect(
      queryAll(element, "pc-button").map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Save", "Reset", "Dismiss"]);
    expect(
      (
        query<PcContextMenu>(element, "pc-context-menu").items as MenuItem[]
      ).map(({ label, disabled }) => [label, Boolean(disabled)]),
    ).toEqual([
      ["New graph", false],
      ["Duplicate…", false],
      ["Rename…", true],
      ["Delete…", true],
    ]);
  });

  it("should say Custom for points that aren't a saved graph, and once edited", async () => {
    const { element, select, options, edit } = await setup({
      points: curved(),
    });
    // Overweight's points, but no ID: still recognised
    expect(select().value).toBe("");
    element.profileId = "overweight";
    await element.updateComplete;
    expect(select().value).toBe("overweight");
    expect(options()[0]).toEqual(["linear", "Linear"]);
    await edit(linearPoints());
    expect(select().value).toBe("");
    expect(options()[0]).toEqual(["", "Custom"]);
    // A graph that doesn't match its ID's points is Custom too
    element.points = linearPoints();
    await element.updateComplete;
    expect(select().value).toBe("");
  });

  it("should load a graph chosen in the drop-down, and reset to the one it opened with", async () => {
    const { element, select, graph } = await setup({ profileId: "linear" });
    select().value = "underweight";
    select().dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(graph().points).toEqual(PROFILE_PRESETS[2]!.content.points);
    element.load("unknown");
    query(element, "pc-button.reset").click();
    await element.updateComplete;
    expect(graph().points).toEqual(linearPoints());
    expect(select().value).toBe("linear");
  });

  it("should use an unchanged graph as it is, and save an edited one with a name first", async () => {
    const { element, profiles, saves, edit } = await setup({
      author: "Ada",
      profileId: "overweight",
      points: curved(),
    });
    query(element, "pc-button.save").click();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual({ points: curved(), profileId: "overweight" });
    expect(element.prompt).not.toHaveBeenCalled();

    await edit(linearPoints());
    await element.save();
    expect(element.prompt).toHaveBeenCalledWith({
      heading: "Save profile graph",
      label: "Name",
      value: "Custom",
      confirm: "Save",
      cancel: "Cancel",
    });
    const soft = profiles.findByName("Soft")!;
    expect(soft.author).toBe("Ada");
    expect(saves[1]).toEqual({ points: linearPoints(), profileId: soft.id });

    // The same name again: asks before replacing it, and it keeps its author
    element.author = "Bo";
    await edit(curved());
    await element.save();
    expect(element.confirm).toHaveBeenCalledWith({
      heading: "Replace profile graph",
      message: 'You already have a profile graph called "Soft". Replace it?',
      confirm: "Replace",
      cancel: "Cancel",
      cancelling: true,
    });
    expect(profiles.graphs).toEqual([
      { ...soft, content: { points: curved() } },
    ]);

    // Not saved when the name or replacing is declined
    await edit(linearPoints());
    vi.mocked(element.confirm).mockReturnValueOnce(false);
    await element.save();
    vi.mocked(element.prompt).mockReturnValueOnce(null);
    await element.save();
    expect(saves).toHaveLength(3);
  });

  it("should start a new graph, duplicate, rename and delete the user's own", async () => {
    const { element, profiles, select, graph } = await setup({
      profileId: "overweight",
      points: curved(),
    });
    await element.act("new");
    await element.updateComplete;
    expect(graph().points).toEqual(linearPoints());
    expect(select().value).toBe("");
    await element.act("duplicate");
    await element.updateComplete;
    const soft = profiles.findByName("Soft")!;
    expect(select().value).toBe(soft.id);
    const menu = () => query<PcContextMenu>(element, "pc-context-menu");
    expect(
      (menu().items as MenuItem[]).slice(2).map(({ disabled }) => disabled),
    ).toEqual([false, false]);
    expect(
      [...select().options].map((option) => option.textContent?.trim()).at(-1),
    ).toBe("Soft");

    vi.mocked(element.prompt).mockReturnValueOnce("Gentle");
    menu().dispatchEvent(
      new CustomEvent("pc-select", { detail: { value: "rename" } }),
    );
    await vi.waitFor(() => expect(profiles.get(soft.id)?.name).toBe("Gentle"));
    vi.mocked(element.prompt).mockReturnValueOnce(null);
    await element.act("rename");

    vi.mocked(element.confirm).mockReturnValueOnce(false);
    await element.act("delete");
    expect(profiles.graphs).toHaveLength(1);
    await element.act("delete");
    expect(element.confirm).toHaveBeenLastCalledWith({
      heading: "Delete profile graph",
      message: 'Delete "Gentle"? This can\'t be undone.',
      confirm: "Delete",
      cancel: "Cancel",
      cancelling: true,
    });
    expect(profiles.graphs).toEqual([]);
    await element.updateComplete;
    expect(select().value).toBe("");
    // Presets can't be renamed or deleted; unknown actions do nothing
    element.load("overweight");
    await element.act("rename");
    await element.act("delete");
    await element.act("other");
    expect(profiles.get("overweight")).toBeDefined();
  });

  it("should close with Dismiss and its window's ⨉ or Escape, without saving", async () => {
    const { element, closes, saves } = await setup();
    query(element, "pc-button.dismiss").click();
    const window = query<PcDialogWindow>(element, "pc-dialog-window");
    window.requestClose("escape");
    expect(window.open).toBe(true);
    expect(closes).toHaveLength(2);
    expect(saves).toHaveLength(0);
  });

  it("should ask in dialogs by default, and keep graphs of its own without a canvas's", async () => {
    const element = await mount<PcProfileEditor>("pc-profile-editor");
    expect(element.profiles.graphs).toEqual([]);
    const asking = async () => {
      const dialog = await vi.waitFor(() =>
        query<PcDialog>(element, "pc-dialog"),
      );
      await dialog.updateComplete;
      return dialog;
    };
    const confirmed = element.confirm({
      heading: "Sure?",
      confirm: "Yes",
      cancel: "No",
    });
    (await asking()).choose(CANCEL_CHOICE);
    expect(await confirmed).toBe(false);
    const named = element.prompt({
      heading: "Name",
      label: "Name",
      value: "x",
      confirm: "Save",
      cancel: "Cancel",
    });
    (await asking()).choose(OK_CHOICE);
    expect(await named).toBe("x");
  });
});
