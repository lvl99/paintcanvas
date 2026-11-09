import { describe, it, expect } from "vitest";
import PaintCanvas from "..";
import type Layer from "../../Layer";

/** A layer's pixel as RGBA */
const pixel = (layer: Layer, x: number, y: number) => [
  ...layer.context.getImageData(x, y, 1, 1).data,
];

describe("copy merged in a real browser", () => {
  it("should copy the shown layers in the mask, mixed as shown, without the hidden ones or the white background", () => {
    const app = new PaintCanvas({ width: 20, height: 20 });
    // Bottom: red on the left; above it, blue in the middle at half opacity; on top, a hidden green layer
    const bottom = app.layers.active;
    bottom.context.fillStyle = "#ff0000";
    bottom.context.fillRect(0, 0, 10, 20);
    const middle = app.layers.create();
    middle.context.fillStyle = "#0000ff";
    middle.context.fillRect(5, 0, 10, 20);
    app.layers.update(middle.id, { opacity: 0.5 });
    const hidden = app.layers.create();
    hidden.context.fillStyle = "#00ff00";
    hidden.context.fillRect(0, 0, 20, 20);
    app.layers.update(hidden.id, { visible: false });

    // Masked to the top half
    app.selection.apply(
      { type: "rect", rect: { x: 0, y: 0, width: 20, height: 10 } },
      "replace",
    );
    expect(app.copyMerged()).toEqual({ x: 0, y: 0, width: 15, height: 10 });

    // Pasted onto a new layer, where it was copied from
    const target = app.layers.create();
    app.paste();
    app.commitTransform();
    expect(pixel(target, 2, 2)).toEqual([255, 0, 0, 255]);
    // Half blue over red (within rounding)
    const [r, g, b, a] = pixel(target, 7, 2) as [
      number,
      number,
      number,
      number,
    ];
    expect([g, a]).toEqual([0, 255]);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 127)).toBeLessThanOrEqual(2);
    // Half blue alone: half transparent
    const [, , blue, alpha] = pixel(target, 12, 2);
    expect(blue).toBe(255);
    expect(Math.abs((alpha as number) - 128)).toBeLessThanOrEqual(2);
    // Outside the mask, and where only the hidden layer has paint
    expect(pixel(target, 2, 15)[3]).toBe(0);
    expect(pixel(target, 17, 2)[3]).toBe(0);
    // The layers copied from are unchanged
    expect(pixel(hidden, 17, 2)).toEqual([0, 255, 0, 255]);
  });
});
