import { describe, expect, it } from "vitest";
import {
  ageDays,
  deathAt,
  isDead,
  jstDate,
  revivedBornAt,
  sizeAt
} from "./time.js";

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
  it("grows once per Japanese calendar day without an upper limit", () => {
    const born = new Date("2026-01-01T00:00:00Z");
    expect(sizeAt(born, born)).toBe(10);
    expect(sizeAt(born, new Date("2026-01-01T14:59:59.999Z"))).toBe(10);
    expect(sizeAt(born, new Date("2026-01-01T15:00:00.000Z"))).toBe(10.3);
    expect(sizeAt(born, new Date("2026-01-02T14:59:59.999Z"))).toBe(10.3);
    expect(sizeAt(born, new Date("2026-01-11T00:00:00Z"))).toBe(13);
    expect(sizeAt(born, new Date("2126-01-01T00:00:00Z"))).toBeGreaterThan(
      10_000
    );
  });

  it("counts the birth date as day one", () => {
    const born = new Date("2026-08-10T14:08:05.938Z");
    expect(ageDays(born, born)).toBe(1);
    expect(ageDays(born, new Date("2026-08-10T14:59:59.999Z"))).toBe(1);
    expect(ageDays(born, new Date("2026-08-10T15:00:00.000Z"))).toBe(2);
  });

  it("gives every marimo born on the same JST date the same daily size", () => {
    const early = new Date("2026-08-10T03:00:00.000Z");
    const late = new Date("2026-08-10T14:59:59.999Z");
    const secondDay = new Date("2026-08-10T15:01:00.000Z");

    expect(sizeAt(early, secondDay)).toBe(10.3);
    expect(sizeAt(late, secondDay)).toBe(10.3);
  });

  it("keeps age and size frozen while a dead marimo waits for revival", () => {
    const born = new Date("2026-08-10T03:00:00Z");
    const died = new Date("2026-08-11T15:00:00Z");
    const revived = new Date("2026-08-14T03:00:00Z");
    const resumedBorn = revivedBornAt(born, died, revived);

    expect(jstDate(resumedBorn)).toBe("2026-08-12");
    expect(ageDays(resumedBorn, revived)).toBe(ageDays(born, died));
    expect(sizeAt(resumedBorn, revived)).toBe(sizeAt(born, died));
  });
});
