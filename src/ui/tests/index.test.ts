import { describe, it, expect } from "vitest";
import * as ui from "..";

describe("@lvl99dotcom/paintcanvas/ui", () => {
  it("should register every base element", () => {
    for (const tag of [
      "pc-icon",
      "pc-button",
      "pc-button-group",
      "pc-icon-toggle",
      "pc-toggle-checkbox",
      "pc-slider",
      "pc-menu",
      "pc-context-menu",
      "pc-dialog",
      "pc-toast",
      "pc-info-tip",
      "pc-popover",
      "pc-panel",
    ])
      expect(customElements.get(tag), tag).toBeDefined();
    expect(ui.icons.get("brush")).toBeDefined();
  });
});
