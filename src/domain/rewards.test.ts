import { describe, expect, it } from "vitest";
import {
  DAILY_WATER_XP_INCREMENT,
  MAX_WATER_XP,
  REVIVAL_COST_XP,
  wateringXp
} from "./rewards.js";

describe("watering XP", () => {
  it("charges 1,000 XP to revive a marimo", () => {
    expect(REVIVAL_COST_XP).toBe(1000);
  });

  it("starts at 100 XP and increases by 10 XP per continuous care day", () => {
    expect(DAILY_WATER_XP_INCREMENT).toBe(10);
    expect(wateringXp(100, 1)).toBe(100);
    expect(wateringXp(100, 2)).toBe(110);
    expect(wateringXp(100, 10)).toBe(190);
  });

  it("caps the daily award at 500 XP", () => {
    expect(MAX_WATER_XP).toBe(500);
    expect(wateringXp(100, 40)).toBe(490);
    expect(wateringXp(100, 41)).toBe(500);
    expect(wateringXp(100, 1000)).toBe(500);
  });

  it("never lowers a configured base award above the standard cap", () => {
    expect(wateringXp(600, 1)).toBe(600);
    expect(wateringXp(600, 100)).toBe(600);
  });
});
