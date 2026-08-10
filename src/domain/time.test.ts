import { describe, expect, it } from "vitest";
import { ageDays, deathAt, isDead, jstDate, sizeAt } from "./time.js";

describe("Japanese calendar care rules", () => {
  it("switches the care date at Japanese midnight", () => {
    expect(jstDate(new Date("2026-08-10T14:59:59Z"))).toBe("2026-08-10");
    expect(jstDate(new Date("2026-08-10T15:00:00Z"))).toBe("2026-08-11");
  });

  it("dies only after one whole calendar day was missed", () => {
    expect(deathAt("2026-08-10").toISOString()).toBe(
      "2026-08-11T15:00:00.000Z"
    );
    expect(isDead("2026-08-10", new Date("2026-08-11T14:59:59Z"))).toBe(false);
    expect(isDead("2026-08-10", new Date("2026-08-11T15:00:00Z"))).toBe(true);
  });
});

describe("growth", () => {
  it("grows continuously without an upper limit", () => {
    const born = new Date("2026-01-01T00:00:00Z");
    expect(sizeAt(born, born)).toBe(10);
    expect(sizeAt(born, new Date("2026-01-11T00:00:00Z"))).toBe(13);
    expect(sizeAt(born, new Date("2126-01-01T00:00:00Z"))).toBeGreaterThan(
      10_000
    );
  });

  it("counts the birth date as day one", () => {
    const born = new Date("2026-01-01T00:00:00Z");
    expect(ageDays(born, born)).toBe(1);
    expect(ageDays(born, new Date("2026-01-02T00:00:00Z"))).toBe(2);
  });
});
