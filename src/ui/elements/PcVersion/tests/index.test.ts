import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcVersion } from "..";
import { mount, shadow } from "../../../../testing/elements";
import {
  PAINTCANVAS_REPOSITORY_URL,
  versionText,
} from "../../../../lib/version";

afterEach(() => document.body.replaceChildren());

describe("pc-version", () => {
  it("should link PaintCanvas's version and commit to its repository, in a new tab", async () => {
    const element = await mount<PcVersion>("pc-version");
    const link = shadow<HTMLAnchorElement>(element, "a");
    expect(link.textContent).toBe(versionText());
    expect(link.textContent).toMatch(/^PaintCanvas v\d+\.\d+\.\d+.* \(\w+\)$/);
    expect(link.href).toBe(PAINTCANVAS_REPOSITORY_URL);
    expect([link.target, link.rel]).toEqual(["_blank", "noopener noreferrer"]);
  });
});
