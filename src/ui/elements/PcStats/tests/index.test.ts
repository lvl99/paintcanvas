import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { formatBytes, type PcStats } from "..";
import { mount, query, queryAll } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";
import { MemoryLayerStore } from "../../../../testing/layerStore";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Run animation frames when asked, collecting them to run by hand */
const stubFrames = () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  /** Run the frames asked for so far */
  const run = () => frames.splice(0).forEach((frame) => frame(0));
  return { frames, run };
};

/** The text of one of the stats */
const stat = (element: PcStats, name: string) =>
  query(element, `li.${name}`).textContent?.replace(/\s+/g, " ").trim();

describe("formatBytes", () => {
  it("should show a size in the largest unit it has at least one of", () => {
    expect(formatBytes(0, "en-GB")).toBe("0 byte");
    expect(formatBytes(512, "en-GB")).toBe("512 byte");
    expect(formatBytes(84_560, "en-GB")).toBe("84.6 kB");
    expect(formatBytes(1_500_000, "en-GB")).toBe("1.5 MB");
    expect(formatBytes(2_000_000_000_000, "en-GB")).toBe("2,000 GB");
  });
});

describe("pc-stats", () => {
  it("should show nothing without a canvas", async () => {
    const element = await mount<PcStats>("pc-stats");
    expect(queryAll(element, "li")).toHaveLength(0);
  });

  it("should show the canvas size, zoom and colour under the pointer, in a labelled list", async () => {
    const { frames, run } = stubFrames();
    const app = createApp();
    const sample = vi.spyOn(app, "sampleColour").mockReturnValue("#ff0000");
    const element = await mount<PcStats>("pc-stats", { app });
    expect(query(element, "ul").getAttribute("aria-label")).toBe(
      "Canvas details",
    );
    expect(stat(element, "size")).toBe("Canvas: 2000 × 2000 px");
    expect(stat(element, "zoom")).toBe("Zoom: 100%");
    // Off the canvas: a dash and no swatch
    expect(stat(element, "colour")).toBe("Color: —");
    expect(queryAll(element, ".swatch")).toHaveLength(0);
    expect(queryAll(element, "li.stored")).toHaveLength(0);

    // Pointer moves are shown once a frame
    app.setPointer({ x: 3, y: 4 });
    app.setPointer({ x: 5, y: 6 });
    expect(frames).toHaveLength(1);
    run();
    await element.updateComplete;
    expect(sample).toHaveBeenLastCalledWith({ x: 5, y: 6 });
    expect(stat(element, "colour")).toBe("Color: #ff0000");
    expect(query(element, ".swatch").style.background).toBe("rgb(255, 0, 0)");

    // Zooming and resizing
    app.viewport.zoom = 0.5;
    app.viewport.dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(stat(element, "zoom")).toBe("Zoom: 50%");
    app.setCanvasSize(300, 200);
    await element.updateComplete;
    expect(stat(element, "size")).toBe("Canvas: 300 × 200 px");
  });

  it("should show how much the drawing takes in the browser while it's kept there", async () => {
    const app = createApp();
    const element = await mount<PcStats>("pc-stats", { app });
    const autosave = app.useLayerStore(new MemoryLayerStore(), {
      locks: null,
      document: null,
      encode: async () => new Blob(["x".repeat(2_500)]),
    });
    await element.updateComplete;
    expect(stat(element, "stored")).toBe("Stored: 0 byte");
    await vi.waitFor(() => expect(autosave?.storedBytes).toBe(2_500));
    await element.updateComplete;
    expect(stat(element, "stored")).toBe("Stored: 2.5 kB");
  });

  it("should follow a new canvas's pointer, and stop following when removed", async () => {
    const { frames } = stubFrames();
    const first = createApp();
    const element = await mount<PcStats>("pc-stats", { app: first });
    const second = createApp();
    element.app = second;
    await element.updateComplete;
    first.setPointer({ x: 1, y: 1 });
    expect(frames).toHaveLength(0);
    second.setPointer({ x: 1, y: 1 });
    expect(frames).toHaveLength(1);
    element.remove();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    second.setPointer({ x: 2, y: 2 });
    expect(frames).toHaveLength(1);
    // Removed with no frame waiting
    document.body.append(element);
    await element.updateComplete;
    element.remove();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
  });
});
