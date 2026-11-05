import { describe, it, expect, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ICONS_DIR,
  ICON_PREFIX,
  PNG_SIZE,
  SVG_SIZE,
  buildIcons,
  iconSvgs,
  optimiseSvg,
  pngName,
  pngSize,
  renderPng,
} from "../build-icons";

// Rendering PNGs can take longer than the usual 5 seconds while the other tests run alongside
vi.setConfig({ testTimeout: 30_000 });

/** Artwork as an editor saves it: sized to fill, with the editor's own attributes */
const EDITOR_SVG =
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?><svg width="100%" height="100%" viewBox="0 0 64 64" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:serif="http://www.serif.com/"><g serif:id="Dot"><circle cx="32" cy="32" r="16" style="fill:#000;"/></g></svg>';

/** Temporary folders made by tests */
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

describe("pngName", () => {
  it("should name an SVG's PNG", () => {
    expect(pngName("icon-brush.svg")).toBe("icon-brush@2x.png");
  });
});

describe("optimiseSvg", () => {
  it("should size the artwork 64 pixels square, leaving out the editor's attributes, and change nothing again", () => {
    const svg = optimiseSvg(EDITOR_SVG);
    expect(svg).toMatch(new RegExp(`^<svg [^>]*width="${SVG_SIZE}"`));
    expect(svg).toMatch(new RegExp(`^<svg [^>]*height="${SVG_SIZE}"`));
    expect(svg).not.toMatch(/100%|serif|<\?xml/);
    expect(optimiseSvg(svg)).toBe(svg);
  });
});

describe("renderPng", () => {
  it("should render the artwork 128 pixels square", () => {
    expect(pngSize(renderPng(optimiseSvg(EDITOR_SVG)))).toEqual({
      width: PNG_SIZE,
      height: PNG_SIZE,
    });
  });
});

describe("buildIcons", () => {
  it("should optimise each icon's SVG and make its PNG, writing only what changes", () => {
    const dir = `${mkdtempSync(join(tmpdir(), "icons-"))}/`;
    folders.push(dir);
    writeFileSync(`${dir}icon-dot.svg`, EDITOR_SVG);
    writeFileSync(`${dir}notes.txt`, "not an icon");
    expect(buildIcons(dir)).toEqual(["icon-dot.svg", "icon-dot@2x.png"]);
    expect(readdirSync(dir).sort()).toEqual([
      "icon-dot.svg",
      "icon-dot@2x.png",
      "notes.txt",
    ]);
    expect(buildIcons(dir)).toEqual([]);
  });
});

describe("the icons", () => {
  const svgs = iconSvgs();

  it("should all be named with the icon prefix, as an SVG and its PNG", () => {
    const files = readdirSync(ICONS_DIR).sort();
    expect(files.every((name) => name.startsWith(ICON_PREFIX))).toBe(true);
    expect(files).toEqual(svgs.flatMap((name) => [name, pngName(name)]).sort());
  });

  it.each(svgs)("%s should be optimised, with its PNG made from it", (name) => {
    const svg = readFileSync(`${ICONS_DIR}${name}`, "utf8");
    expect(optimiseSvg(svg), "run node scripts/build-icons.ts").toBe(svg);
    const png = readFileSync(`${ICONS_DIR}${pngName(name)}`);
    expect(pngSize(png)).toEqual({ width: PNG_SIZE, height: PNG_SIZE });
    expect(png.equals(renderPng(svg)), "run node scripts/build-icons.ts").toBe(
      true,
    );
  });
});
