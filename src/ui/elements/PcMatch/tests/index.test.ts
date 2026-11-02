import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcMatch } from "..";
import "../../PaintCanvas";
import type { PaintCanvasElement } from "../../PaintCanvas";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

/** A layout with a `pc-match` in its overlay */
const setup = async (
  when: string,
  template = "<template><b>Shown</b></template>",
) => {
  const layout = document.createElement("paint-canvas") as PaintCanvasElement;
  layout.app = createApp();
  layout.innerHTML = `<pc-match slot="overlay" when="${when}">${template}</pc-match>`;
  document.body.append(layout);
  await layout.updateComplete;
  const match = layout.querySelector("pc-match") as PcMatch;
  await match.updateComplete;
  return { layout, match };
};

describe("pc-match", () => {
  it("should create its template's contents beside it while the condition holds", async () => {
    const { layout, match } = await setup("narrow");
    layout.width = 400;
    await layout.updateComplete;
    await match.updateComplete;
    expect(match.active).toBe(true);
    expect(match.querySelector("b")?.textContent).toBe("Shown");
    layout.width = 900;
    await layout.updateComplete;
    await match.updateComplete;
    expect(match.querySelector("b")).toBeNull();
  });

  it("should remove its contents when removed, and show nothing without a template or outside a layout", async () => {
    const { layout, match } = await setup("!narrow");
    layout.width = 900;
    await layout.updateComplete;
    await match.updateComplete;
    expect(match.querySelector("b")).not.toBeNull();
    match.remove();
    expect(match.querySelector("b")).toBeNull();

    const empty = await setup("!narrow", "");
    empty.layout.width = 900;
    await empty.layout.updateComplete;
    await empty.match.updateComplete;
    expect(empty.match.childNodes).toHaveLength(1);

    const loose = document.createElement("pc-match") as PcMatch;
    loose.when = "";
    document.body.append(loose);
    await loose.updateComplete;
    expect(loose.active).toBe(false);
  });
});
