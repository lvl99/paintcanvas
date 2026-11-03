import { describe, it, expect, vi } from "vitest";
import PaintCanvas from "../../PaintCanvas";
import { AutosaveState } from "..";
import IndexedDbLayerStore from "../../../storage";
import { BlendMode } from "../../Layer";

/** A unique name, so test runs don't share drawings */
const uniqueName = () => `test-${crypto.randomUUID()}`;

/** A canvas keeping its layers in the browser under a name */
const open = (name: string) => {
  const canvas = new PaintCanvas({ width: 20, height: 10 });
  const autosave = canvas.useLayerStore(new IndexedDbLayerStore(name));
  return { canvas, autosave: autosave as NonNullable<typeof autosave> };
};

/** Wait until an autosave is in a state */
const reach = (
  autosave: ReturnType<typeof open>["autosave"],
  state: AutosaveState,
) => vi.waitFor(() => expect(autosave.state).toBe(state));

/** Each layer's pixels, top first */
const pixels = (canvas: PaintCanvas) =>
  canvas.layers.layers.map((layer) => [
    ...layer.context.getImageData(0, 0, layer.width, layer.height).data,
  ]);

describe("keeping layers in a real browser", () => {
  it("should restore the same pixels, layers and selection after the page is reloaded", async () => {
    const name = uniqueName();
    const first = open(name);
    await reach(first.autosave, AutosaveState.Ready);
    const { canvas } = first;
    const bottom = canvas.layers.active;
    canvas.layers.changeImage(
      bottom.id,
      { x: 0, y: 0, width: 20, height: 10 },
      (ctx) => {
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(2, 1, 5, 4);
      },
    );
    const top = canvas.layers.create();
    canvas.layers.changeImage(
      top.id,
      { x: 0, y: 0, width: 20, height: 10 },
      (ctx) => {
        ctx.fillStyle = "rgba(0, 0, 255, 0.5)";
        ctx.fillRect(10, 3, 6, 6);
      },
    );
    canvas.layers.update(top.id, { blendMode: BlendMode.Multiply });
    canvas.layers.select(bottom.id);
    const before = pixels(canvas);
    // Closing the page saves, then lets another window have the drawing
    await first.autosave.stop();

    const reloaded = open(name);
    await reach(reloaded.autosave, AutosaveState.Ready);
    expect(pixels(reloaded.canvas)).toEqual(before);
    expect(
      reloaded.canvas.layers.layers.map((layer) => layer.toConfig()),
    ).toEqual(canvas.layers.layers.map((layer) => layer.toConfig()));
    expect(reloaded.canvas.layers.active.id).toBe(bottom.id);
    await reloaded.autosave.stop();
    await new IndexedDbLayerStore(name).clear();
  });

  it("should let only one window draw, until another takes the drawing over", async () => {
    const name = uniqueName();
    const first = open(name);
    await reach(first.autosave, AutosaveState.Ready);
    const second = open(name);
    await reach(second.autosave, AutosaveState.Elsewhere);
    second.autosave.takeOver();
    await reach(second.autosave, AutosaveState.Ready);
    await reach(first.autosave, AutosaveState.Elsewhere);
    await second.autosave.stop();
    await first.autosave.stop();
    await new IndexedDbLayerStore(name).clear();
  });
});
