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
      expect(line.motifIds).toHaveLength(2);
    }
  });

  it("keeps the voice casual instead of romantic or theatrical", () => {
    for (const line of MARIMO_DIALOGUES) {
      expect(line.text).not.toMatch(
        /あなた|宝物|きずな|しあわせ|幸せ|胸のあたり|大切な思い出|ぬくもり/
      );
    }
  });

  it("never grades, orders, or talks down to the owner", () => {
    for (const line of MARIMO_DIALOGUES) {
      expect(line.text).not.toMatch(
        /飼育係|まりも係|合格|不合格|採点|感心|\d+点|品質|次回も|忘れなかった|当然|褒めて|まかせて|許して/
      );
    }
  });

  it("mixes harmless aquarium mysteries with gentle self-deprecation", () => {
    const everyday = MARIMO_DIALOGUES.filter((line) =>
      line.id.startsWith("everyday-")
    );
    const requestedSetups = [
      "底の石が動いた気がする。石は知らないって。",
      "水草から相談されたけど、聞こえないふりをした。",
      "同じ泡を三回見た。たぶん顔なじみ。",
      "きょうの水、ちょっと木曜日の味がする。"
    ];

    expect(everyday).toHaveLength(100);
    for (const setup of requestedSetups) {
      expect(
        everyday.filter((line) => line.text.startsWith(setup))
      ).toHaveLength(10);
    }
    expect(everyday.some((line) => line.text.includes("ぼくより行動力"))).toBe(
      true
    );
    expect(everyday.some((line) => line.text.includes("ただ丸く"))).toBe(true);
    expect(everyday.some((line) => line.text.includes("困ってはいない"))).toBe(
      true
    );
    for (const line of everyday) {
      expect(line.text).not.toMatch(/飼い主|監視|背後|呪|怖|逃げ|助けて/);
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

  it("avoids recently used setups and punchlines, not only exact lines", () => {
    const recentDialogueIds: string[] = [];
    const recentMotifIds = new Set<string>();

    for (let index = 0; index < 8; index += 1) {
      const dialogue = selectMarimoDialogue({
        ...ordinaryContext,
        eventId: `motif-event-${index}`,
        ageDays: 4,
        recentDialogueIds
      });

      expect(
        dialogue.motifIds.every((motifId) => !recentMotifIds.has(motifId))
      ).toBe(true);
      recentDialogueIds.unshift(dialogue.id);
      recentDialogueIds.splice(7);
      recentMotifIds.clear();
      for (const recentId of recentDialogueIds) {
        const recent = MARIMO_DIALOGUES.find((line) => line.id === recentId);
        for (const motifId of recent?.motifIds ?? []) {
          recentMotifIds.add(motifId);
        }
      }
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
