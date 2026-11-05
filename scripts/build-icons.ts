// Optimises the icons' SVG source artwork and makes the PNGs the UI uses from it. Run with: node scripts/build-icons.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { optimize } from "svgo";

/** Where the icons are */
export const ICONS_DIR = `${resolve(import.meta.dirname, "../src/ui/icons/images")}/`;

/** Every icon's file name starts with this */
export const ICON_PREFIX = "icon-";

/** Width and height of the SVG source artwork, in pixels */
export const SVG_SIZE = 64;

/** Width and height of the PNGs made from it, in pixels (twice the SVG's, for high-density screens) */
export const PNG_SIZE = 128;

/**
 * The PNG's file name for an icon's SVG.
 *
 * @example
 * pngName("icon-brush.svg"); // "icon-brush@2x.png"
 */
export const pngName = (svgName: string): string =>
  svgName.replace(/\.svg$/, "@2x.png");

/**
 * Optimise an icon's SVG with svgo, sizing it `SVG_SIZE` pixels square. Optimising it again changes nothing.
 *
 * @example
 * optimiseSvg('<svg width="100%" height="100%" viewBox="0 0 64 64">…</svg>');
 * // '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" …>…</svg>'
 */
export const optimiseSvg = (source: string): string => {
  const { data } = optimize(source, {
    multipass: true,
    plugins: [
      "preset-default",
      // Keep the artwork's own size from the editor out, and set the icons' size
      "removeDimensions",
      {
        name: "addAttributesToSVGElement",
        params: {
          attributes: [
            { width: String(SVG_SIZE) },
            { height: String(SVG_SIZE) },
          ],
        },
      },
    ],
  });
  return `${data}\n`;
};

/**
 * Render an icon's SVG as a `PNG_SIZE` pixels square PNG.
 *
 * @example
 * writeFileSync("icon-brush@2x.png", renderPng(readFileSync("icon-brush.svg", "utf8")));
 */
export const renderPng = (svg: string): Buffer =>
  new Resvg(svg, { fitTo: { mode: "width", value: PNG_SIZE } })
    .render()
    .asPng();

/**
 * A PNG's width and height, read from its header.
 *
 * @example
 * pngSize(readFileSync("icon-brush@2x.png")); // { width: 128, height: 128 }
 */
export const pngSize = (png: Buffer): { width: number; height: number } => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

/**
 * The file names of the icons' SVGs.
 *
 * @example
 * iconSvgs(); // ["icon-brush.svg", "icon-circle-mask.svg", …]
 */
export const iconSvgs = (dir = ICONS_DIR): string[] =>
  readdirSync(dir)
    .filter((name) => name.startsWith(ICON_PREFIX) && name.endsWith(".svg"))
    .sort();

/**
 * Optimise every icon's SVG and make its PNG, writing only files that change. Returns the names of the files written.
 */
export const buildIcons = (dir = ICONS_DIR): string[] => {
  const written: string[] = [];
  const write = (name: string, data: string | Buffer) => {
    const path = `${dir}${name}`;
    let current: Buffer | undefined;
    try {
      current = readFileSync(path);
    } catch {
      current = undefined;
    }
    if (current?.equals(Buffer.from(data))) return;
    writeFileSync(path, data);
    written.push(name);
  };
  for (const name of iconSvgs(dir)) {
    const svg = optimiseSvg(readFileSync(`${dir}${name}`, "utf8"));
    write(name, svg);
    write(pngName(name), renderPng(svg));
  }
  return written;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const written = buildIcons();
  console.log(
    written.length
      ? `Wrote ${written.join(", ")}`
      : "Icons are already up to date",
  );
}
