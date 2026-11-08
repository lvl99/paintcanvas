import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { COLOUR_INTERVAL_MS, formatBytes, type PcStats } from "..";
import { mount, query, queryAll } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";
import { MemoryLayerStore } from "../../../../testing/layerStore";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    vi.useFakeTimers();
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

    // The colour is read at most every interval, at the pointer's latest position
    app.setPointer({ x: 3, y: 4 });
    app.setPointer({ x: 5, y: 6 });
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS - 1);
    expect(sample).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(sample).toHaveBeenCalledOnce();
    expect(sample).toHaveBeenLastCalledWith({ x: 5, y: 6 });
    await element.updateComplete;
    expect(stat(element, "colour")).toBe("Color: #ff0000");
    expect(query(element, ".swatch").style.background).toBe("rgb(255, 0, 0)");

    // Other changes show the colour last read, without reading it again
    app.viewport.zoom = 0.75;
    app.viewport.dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(sample).toHaveBeenCalledOnce();

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
    expect(queryAll(element, "li").map((item) => item.className)).toEqual([
      "size",
      "stored",
      "zoom",
      "colour",
    ]);
  });

  it("should not read the colour while a stroke is drawn", async () => {
    vi.useFakeTimers();
    const app = createApp();
    const sample = vi.spyOn(app, "sampleColour").mockReturnValue("#ff0000");
    const drawing = vi.spyOn(app.strokes, "drawing", "get");
    const element = await mount<PcStats>("pc-stats", { app });
    drawing.mockReturnValue(true);
    app.setPointer({ x: 3, y: 4 });
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS);
    expect(sample).not.toHaveBeenCalled();
    // The next move after the stroke reads it
    drawing.mockReturnValue(false);
    app.setPointer({ x: 5, y: 6 });
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS);
    expect(sample).toHaveBeenCalledWith({ x: 5, y: 6 });
    await element.updateComplete;
    expect(stat(element, "colour")).toBe("Color: #ff0000");
  });

  it("should follow a new canvas's pointer, and stop following when removed", async () => {
    vi.useFakeTimers();
    const first = createApp();
    const firstSample = vi
      .spyOn(first, "sampleColour")
      .mockReturnValue("#ff0000");
    const element = await mount<PcStats>("pc-stats", { app: first });
    first.setPointer({ x: 1, y: 1 });
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS);
    await element.updateComplete;
    expect(stat(element, "colour")).toBe("Color: #ff0000");
    const second = createApp();
    const secondSample = vi
      .spyOn(second, "sampleColour")
      .mockReturnValue("#00ff00");
    // A read waiting for the first canvas is forgotten, as is its colour
    first.setPointer({ x: 2, y: 2 });
    element.app = second;
    await element.updateComplete;
    expect(stat(element, "colour")).toBe("Color: —");
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS);
    first.setPointer({ x: 3, y: 3 });
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS);
    expect(firstSample).toHaveBeenCalledOnce();
    second.setPointer({ x: 1, y: 1 });
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS);
    expect(secondSample).toHaveBeenCalledOnce();
    // Removed: a waiting read is forgotten, and moves aren't followed
    second.setPointer({ x: 2, y: 2 });
    element.remove();
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS);
    second.setPointer({ x: 3, y: 3 });
    vi.advanceTimersByTime(COLOUR_INTERVAL_MS);
    expect(secondSample).toHaveBeenCalledOnce();
  });
});
