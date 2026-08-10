import { describe, expect, it } from "vitest";
import { deathAt, isDead, jstDate } from "./time.js";

const tokyoCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function oracleJstDate(at: Date): string {
  const parts = Object.fromEntries(
    tokyoCalendar
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function oracleDeathAt(lastWateredDate: string): Date {
  const [yearText, monthText, dayText] = lastWateredDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  // Date.UTC performs Gregorian month/year rollover. Tokyo midnight is UTC-9h.
  return new Date(Date.UTC(year, month - 1, day + 2) - 9 * 60 * 60 * 1000);
}

describe("calendar pseudo-oracle", () => {
  it("matches the independent Asia/Tokyo calendar across boundaries", () => {
    const anchors = [
      "2024-02-28T14:59:59.999Z",
      "2024-02-28T15:00:00.000Z",
      "2024-02-29T15:00:00.000Z",
      "2025-02-28T15:00:00.000Z",
      "2026-08-10T14:59:59.999Z",
      "2026-08-10T15:00:00.000Z",
      "2026-12-31T14:59:59.999Z",
      "2026-12-31T15:00:00.000Z"
    ];

    for (const anchor of anchors) {
      const at = new Date(anchor);
      expect(jstDate(at), anchor).toBe(oracleJstDate(at));
    }
  });

  it("matches Gregorian rollover and flips death at the exact instant", () => {
    const careDates = [
      "2024-02-28",
      "2024-02-29",
      "2025-02-28",
      "2026-01-30",
      "2026-01-31",
      "2026-12-30",
      "2026-12-31"
    ];

    for (const careDate of careDates) {
      const expected = oracleDeathAt(careDate);
      expect(deathAt(careDate), careDate).toEqual(expected);
      expect(isDead(careDate, new Date(expected.getTime() - 1)), careDate).toBe(
        false
      );
      expect(isDead(careDate, expected), careDate).toBe(true);
    }
  });
});
