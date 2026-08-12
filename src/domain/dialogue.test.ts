import { describe, expect, it } from "vitest";
import {
  MARIMO_DIALOGUES,
  marimoDialogueText,
  selectMarimoDialogue
} from "./dialogue.js";

const ordinaryContext = {
  isBirth: false,
  ageDays: 12,
  sizeMm: 13.3,
  wateredDate: "2026-08-21",
  recentDialogueIds: []
};

describe("marimo dialogue", () => {
  it("provides exactly 1,000 safe and genuinely distinct lines", () => {
    expect(MARIMO_DIALOGUES).toHaveLength(1_000);
    expect(new Set(MARIMO_DIALOGUES.map((line) => line.id)).size).toBe(1_000);
    expect(new Set(MARIMO_DIALOGUES.map((line) => line.text)).size).toBe(1_000);
    for (const line of MARIMO_DIALOGUES) {
      expect(line.id).toMatch(/^[a-z]+-\d{2}-\d{2}$/);
      expect(line.text.length).toBeGreaterThanOrEqual(10);
      expect(line.text.length).toBeLessThanOrEqual(120);
      expect(line.text).not.toMatch(/\r|\n|<@|@everyone|@here|https?:\/\//i);
    }
  });

  it("uses dialogue suited to births, early care, and milestones", () => {
    const birth = selectMarimoDialogue({
      ...ordinaryContext,
      eventId: "birth-event",
      isBirth: true,
      ageDays: 1
    });
    const early = selectMarimoDialogue({
      ...ordinaryContext,
      eventId: "early-event",
      ageDays: 4
    });
    const milestone = selectMarimoDialogue({
      ...ordinaryContext,
      eventId: "milestone-event",
      ageDays: 10
    });

    expect(birth.id).toMatch(/^birth-/);
    expect(early.id).toMatch(/^early-/);
    expect(milestone.id).toMatch(/^milestone-/);
  });

  it("mixes everyday lines with the matching season, bond, and size themes", () => {
    const summerCategories = new Set(
      Array.from(
        { length: 200 },
        (_, index) =>
          selectMarimoDialogue({
            ...ordinaryContext,
            eventId: `summer-event-${index}`
          }).id.split("-")[0]
      )
    );
    const matureWinterCategories = new Set(
      Array.from(
        { length: 400 },
        (_, index) =>
          selectMarimoDialogue({
            ...ordinaryContext,
            eventId: `mature-winter-event-${index}`,
            ageDays: 201,
            sizeMm: 60,
            wateredDate: "2026-01-21"
          }).id.split("-")[0]
      )
    );

    expect(summerCategories).toEqual(new Set(["everyday", "summer"]));
    expect(matureWinterCategories).toEqual(
      new Set(["everyday", "winter", "bond", "large"])
    );
  });

  it("is deterministic and excludes the owner's seven recent lines", () => {
    const first = selectMarimoDialogue({
      ...ordinaryContext,
      eventId: "stable-event"
    });
    const repeated = selectMarimoDialogue({
      ...ordinaryContext,
      eventId: "stable-event"
    });
    expect(repeated).toEqual(first);

    const recentDialogueIds: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const dialogue = selectMarimoDialogue({
        ...ordinaryContext,
        eventId: `ordinary-event-${index}`,
        ageDays: 4,
        recentDialogueIds
      });
      expect(recentDialogueIds).not.toContain(dialogue.id);
      recentDialogueIds.unshift(dialogue.id);
      recentDialogueIds.splice(7);
    }
  });

  it("resolves known IDs and safely ignores historical or unknown IDs", () => {
    const first = MARIMO_DIALOGUES[0];
    expect(first).toBeDefined();
    expect(marimoDialogueText(first?.id ?? null)).toBe(first?.text);
    expect(marimoDialogueText(null)).toBeNull();
    expect(marimoDialogueText("unknown-99-99")).toBeNull();
  });
});
