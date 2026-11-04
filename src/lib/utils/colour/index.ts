/** A colour's red, green and blue channels, each from 0 to 255 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A colour's hue (0–360 degrees), saturation (0–100%) and lightness (0–100%) */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Pattern for `#rrggbb` colours */
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/** Pattern for hex colours as people type them: 3 or 6 digits, with or without `#` */
const HEX_INPUT_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Keep a number within a range.
 *
 * @example
 * clamp(300, 0, 255); // 255
 */
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Check that a value is a 6-digit hex colour, e.g. `#ff0000`.
 *
 * @example
 * isHexColour("#FF00aa"); // true
 * isHexColour("red"); // false
 */
export const isHexColour = (value: unknown): value is string =>
  typeof value === "string" && HEX_PATTERN.test(value);

/**
 * Turn a hex colour as typed (3 or 6 digits, with or without `#`, any case) into `#rrggbb`. Undefined if it isn't one.
 *
 * @example
 * normaliseHex("F0a"); // "#ff00aa"
 * normaliseHex(" #123456 "); // "#123456"
 * normaliseHex("#12345"); // undefined
 */
export const normaliseHex = (input: string): string | undefined => {
  const digits = HEX_INPUT_PATTERN.exec(input.trim())?.[1];
  if (!digits) return undefined;
  const full =
    digits.length === 3
      ? [...digits].map((digit) => digit + digit).join("")
      : digits;
  return `#${full.toLowerCase()}`;
};

/**
 * The red, green and blue channels of a `#rrggbb` colour.
 *
 * @example
 * hexToRgb("#ff8000"); // { r: 255, g: 128, b: 0 }
 */
export const hexToRgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

/**
 * Format red, green and blue channels as `#rrggbb`, rounding and keeping each from 0 to 255.
 *
 * @example
 * rgbToHex({ r: 255, g: 127.6, b: -3 }); // "#ff8000"
 */
export const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/**
 * Convert red, green and blue channels to hue, saturation and lightness, rounded to whole numbers. Greys have hue 0.
 *
 * @example
 * rgbToHsl({ r: 255, g: 0, b: 0 }); // { h: 0, s: 100, l: 50 }
 */
export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const [red, green, blue] = [r, g, b].map((channel) => channel / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const range = max - min;
  if (range === 0) return { h: 0, s: 0, l: Math.round(lightness * 100) };
  const saturation = range / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === red
      ? ((green - blue) / range + 6) % 6
      : max === green
        ? (blue - red) / range + 2
        : (red - green) / range + 4;
  return {
    h: Math.round(hue * 60) % 360,
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
};

/**
 * Convert hue (degrees, wrapped to 0–360), saturation and lightness (percentages, kept from 0 to 100) to red, green and
 * blue channels, rounded to whole numbers.
 *
 * @example
 * hslToRgb({ h: 120, s: 100, l: 25 }); // { r: 0, g: 128, b: 0 }
 */
export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
  const hue = (((h % 360) + 360) % 360) / 60;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const sector = Math.floor(hue);
  const [red, green, blue] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][sector] as [number, number, number];
  const match = lightness - chroma / 2;
  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
};

/**
 * Convert a `#rrggbb` colour to hue, saturation and lightness.
 *
 * @example
 * hexToHsl("#ff0000"); // { h: 0, s: 100, l: 50 }
 */
export const hexToHsl = (hex: string): Hsl => rgbToHsl(hexToRgb(hex));

/**
 * Convert hue, saturation and lightness to a `#rrggbb` colour.
 *
 * @example
 * hslToHex({ h: 240, s: 100, l: 50 }); // "#0000ff"
 */
export const hslToHex = (hsl: Hsl): string => rgbToHex(hslToRgb(hsl));
