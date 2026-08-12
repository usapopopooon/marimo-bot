import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  livingTankImageInput,
  marimoRadiusForSize,
  renderTankImage
} from "./tank.js";

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

  it("maps a living marimo to the same image inputs used by watering logs", () => {
    expect(
      livingTankImageInput({
        id: "1",
        guildId: "1001",
        userId: "2001",
        generation: 3,
        ownerDisplayName: "owner",
        name: "まりも",
        bornAt: new Date("2026-08-10T00:00:00Z"),
        lastWateredAt: new Date("2026-08-12T00:00:00Z"),
        lastWateredDate: "2026-08-12",
        sizeMm: 10.6,
        ageDays: 3
      })
    ).toEqual({
      seed: "1001:2001:3",
      sizeMm: 10.6,
      ageDays: 3
    });
  });
});
