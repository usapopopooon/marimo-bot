import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { marimoRadiusForSize, renderTankImage } from "./tank.js";

describe("tank image", () => {
  it("renders a Discord-friendly landscape PNG", async () => {
    const image = await renderTankImage({
      seed: "guild:user:1",
      sizeMm: 42.5,
      ageDays: 87
    });
    const metadata = await sharp(image).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(675);
  });

  it("renders huge and dead marimos without overflowing", async () => {
    const image = await renderTankImage({
      seed: "guild:user:99",
      sizeMm: 1_000_000,
      ageDays: 999_999,
      dead: true
    });
    expect(image.byteLength).toBeGreaterThan(10_000);
  });

  it("grows without a visual cap", () => {
    const boundarySizes = [10, 24.99, 25, 49.99, 50, 99.99, 100, 249.99, 250];
    const radii = boundarySizes.map(marimoRadiusForSize);
    expect(radii).toEqual([...radii].sort((left, right) => left - right));
    expect(marimoRadiusForSize(1_000_000)).toBe(1_000_000);
  });
});
