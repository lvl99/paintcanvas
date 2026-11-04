import { describe, it, expect } from "vitest";
import {
  hexToHsl,
  hexToRgb,
  hslToHex,
  hslToRgb,
  isHexColour,
  normaliseHex,
  rgbToHex,
  rgbToHsl,
} from "..";

describe("isHexColour", () => {
  it.each([
    ["#ff0000", true],
    ["#FFaa00", true],
    ["#fff", false],
    ["ff0000", false],
    ["red", false],
    [16711680, false],
    [undefined, false],
  ])("should check %j is a hex colour: %s", (value, valid) => {
    expect(isHexColour(value)).toBe(valid);
  });
});

describe("normaliseHex", () => {
  it.each([
    ["F0a", "#ff00aa"],
    ["#f0a", "#ff00aa"],
    [" #123ABC ", "#123abc"],
    ["123456", "#123456"],
    ["#12345", undefined],
    ["#ggg", undefined],
    ["", undefined],
  ])("should turn %j into %j", (input, hex) => {
    expect(normaliseHex(input)).toBe(hex);
  });
});

describe("hexToRgb and rgbToHex", () => {
  it("should convert between hex and RGB", () => {
    expect(hexToRgb("#ff8000")).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe("#ff8000");
    expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
  });

  it("should round and keep channels from 0 to 255", () => {
    expect(rgbToHex({ r: 300, g: 127.6, b: -3 })).toBe("#ff8000");
  });
});

describe("rgbToHsl", () => {
  it.each([
    [
      { r: 255, g: 0, b: 0 },
      { h: 0, s: 100, l: 50 },
    ],
    [
      { r: 0, g: 255, b: 0 },
      { h: 120, s: 100, l: 50 },
    ],
    [
      { r: 0, g: 0, b: 255 },
      { h: 240, s: 100, l: 50 },
    ],
    [
      { r: 255, g: 0, b: 128 },
      { h: 330, s: 100, l: 50 },
    ],
    [
      { r: 255, g: 255, b: 255 },
      { h: 0, s: 0, l: 100 },
    ],
    [
      { r: 128, g: 128, b: 128 },
      { h: 0, s: 0, l: 50 },
    ],
    [
      { r: 0, g: 128, b: 0 },
      { h: 120, s: 100, l: 25 },
    ],
    // Hue just under 360 rounds to 0, not 360
    [
      { r: 255, g: 0, b: 1 },
      { h: 0, s: 100, l: 50 },
    ],
  ])("should convert %j to %j", (rgb, hsl) => {
    expect(rgbToHsl(rgb)).toEqual(hsl);
  });
});

describe("hslToRgb", () => {
  it.each([
    [
      { h: 0, s: 100, l: 50 },
      { r: 255, g: 0, b: 0 },
    ],
    [
      { h: 60, s: 100, l: 50 },
      { r: 255, g: 255, b: 0 },
    ],
    [
      { h: 120, s: 100, l: 25 },
      { r: 0, g: 128, b: 0 },
    ],
    [
      { h: 180, s: 100, l: 50 },
      { r: 0, g: 255, b: 255 },
    ],
    [
      { h: 240, s: 100, l: 50 },
      { r: 0, g: 0, b: 255 },
    ],
    [
      { h: 300, s: 100, l: 50 },
      { r: 255, g: 0, b: 255 },
    ],
    [
      { h: 0, s: 0, l: 50 },
      { r: 128, g: 128, b: 128 },
    ],
    // Hue wraps; saturation and lightness are kept from 0 to 100
    [
      { h: 360, s: 100, l: 50 },
      { r: 255, g: 0, b: 0 },
    ],
    [
      { h: -120, s: 100, l: 50 },
      { r: 0, g: 0, b: 255 },
    ],
    [
      { h: 0, s: 150, l: 120 },
      { r: 255, g: 255, b: 255 },
    ],
    [
      { h: 0, s: -10, l: -10 },
      { r: 0, g: 0, b: 0 },
    ],
  ])("should convert %j to %j", (hsl, rgb) => {
    expect(hslToRgb(hsl)).toEqual(rgb);
  });
});

describe("hexToHsl and hslToHex", () => {
  it("should convert between hex and HSL", () => {
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
    expect(hslToHex({ h: 240, s: 100, l: 50 })).toBe("#0000ff");
  });

  it("should give back primary and grey colours unchanged", () => {
    for (const hex of ["#ff0000", "#00ffff", "#000000", "#ffffff", "#808080"])
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
  });
});
