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
  wateredAt: new Date("2026-08-21T03:00:00Z"),
  recentDialogueIds: []
};

describe("marimo dialogue", () => {
  it("provides exactly 1,400 safe and genuinely distinct lines", () => {
    expect(MARIMO_DIALOGUES).toHaveLength(1_400);
    expect(new Set(MARIMO_DIALOGUES.map((line) => line.id)).size).toBe(1_400);
    expect(new Set(MARIMO_DIALOGUES.map((line) => line.text)).size).toBe(1_400);
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

  it("keeps every late-night variation quiet, time-aware, and non-directive", () => {
    const lateNight = MARIMO_DIALOGUES.filter((line) =>
      line.id.startsWith("latenight-")
    );

    expect(lateNight).toHaveLength(100);
    for (const line of lateNight) {
      expect(line.text).toMatch(
        /夜|遅い時間|こんな時間|深夜|静かな時間|時計|朝にはまだ/
      );
      expect(line.text).not.toMatch(/寝ろ|寝てください|早く寝|休んでください/);
      expect(line.text).not.toMatch(
        /そばで|いっしょに|なれたら|そっと預か|降りてきました|やさしいところ/
      );
      expect(line.text).toMatch(
        /普段から|違いは、時間だけ|顔はありません|先に落ち着いて|たぶん泡|差は不明|特別な仕事|確認はできません|見分け方はありません|最初から少なめ/
      );
    }
    expect(
      lateNight.filter((line) =>
        line.text.includes(
          "実は、さっきまで寝ていました。いえ、寝ていません。見分け方はありません。"
        )
      )
    ).toHaveLength(10);
  });

  it("does not infer room brightness from the time of day", () => {
    const timeBased = MARIMO_DIALOGUES.filter((line) =>
      /^(morning|daytime|evening|latenight)-/.test(line.id)
    );

    expect(timeBased).toHaveLength(400);
    for (const line of timeBased) {
      expect(line.text).not.toMatch(
        /明る|明かり|光が|光で|光を|ぴか|きら|夕暮れ|暮れていく/
      );
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

  it("mixes everyday lines with the matching time, season, bond, and size themes", () => {
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

    expect(summerCategories).toEqual(
      new Set(["everyday", "summer", "daytime"])
    );
    expect(matureWinterCategories).toEqual(
      new Set(["everyday", "winter", "daytime", "bond", "large"])
    );
  });

  it("uses a soothing late-night line for ordinary care from 22:00 through 04:59 JST", () => {
    for (const wateredAt of [
      new Date("2026-08-21T13:00:00Z"),
      new Date("2026-08-21T15:00:00Z"),
      new Date("2026-08-21T19:59:59Z")
    ]) {
      for (let index = 0; index < 20; index += 1) {
        const dialogue = selectMarimoDialogue({
          ...ordinaryContext,
          eventId: `late-night-event-${wateredAt.toISOString()}-${index}`,
          wateredAt
        });
        expect(dialogue.id).toMatch(/^latenight-/);
      }
    }
  });

  it("keeps birth and milestone context ahead of the late-night theme", () => {
    const lateNight = new Date("2026-08-21T15:00:00Z");
    const birth = selectMarimoDialogue({
      ...ordinaryContext,
      eventId: "late-night-birth-event",
      wateredAt: lateNight,
      isBirth: true,
      ageDays: 1
    });
    const milestone = selectMarimoDialogue({
      ...ordinaryContext,
      eventId: "late-night-milestone-event",
      wateredAt: lateNight,
      ageDays: 10
    });

    expect(birth.id).toMatch(/^birth-/);
    expect(milestone.id).toMatch(/^milestone-/);
  });

  it("uses morning, daytime, and evening lines only in their JST periods", () => {
    const categoriesAt = (wateredAt: Date) =>
      new Set(
        Array.from(
          { length: 300 },
          (_, index) =>
            selectMarimoDialogue({
              ...ordinaryContext,
              eventId: `time-event-${wateredAt.toISOString()}-${index}`,
              wateredAt
            }).id.split("-")[0]
        )
      );

    expect(categoriesAt(new Date("2026-08-20T20:00:00Z"))).toEqual(
      new Set(["everyday", "summer", "morning"])
    );
    expect(categoriesAt(new Date("2026-08-21T02:00:00Z"))).toEqual(
      new Set(["everyday", "summer", "daytime"])
    );
    expect(categoriesAt(new Date("2026-08-21T08:00:00Z"))).toEqual(
      new Set(["everyday", "summer", "evening"])
    );
    expect(categoriesAt(new Date("2026-08-21T12:59:59Z"))).toEqual(
      new Set(["everyday", "summer", "evening"])
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
