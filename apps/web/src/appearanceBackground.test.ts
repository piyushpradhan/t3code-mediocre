import { describe, expect, it } from "vite-plus/test";

import { imageAccent } from "./appearanceBackground";

describe("imageAccent", () => {
  it("groups nearby colors and ignores transparent pixels", () => {
    expect(
      imageAccent(
        new Uint8ClampedArray([240, 32, 64, 255, 242, 34, 66, 255, 0, 128, 240, 255, 0, 0, 0, 0]),
      ),
    ).toBe("#f12141");
    expect(imageAccent(new Uint8ClampedArray([0, 0, 0, 0]))).toBe("#808080");
    expect(imageAccent(new Uint8ClampedArray([0, 0, 0, 255]))).toBe("#000000");
  });
});
