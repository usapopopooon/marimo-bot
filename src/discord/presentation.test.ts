import { describe, expect, it } from "vitest";
import { marimoDialogueText } from "../domain/dialogue.js";
import type { DeadMarimo, RankingEntry } from "../domain/types.js";
import {
  deadRankingPanel,
  deathLogContent,
  isCareStreakMilestone,
  nameModal,
  NAME_BUTTON_ID,
  NAME_INPUT_ID,
  NAME_MODAL_ID,
  rankingPanel,
  REVIVE_BUTTON_ID,
  STATUS_BUTTON_ID,
  statusContent,
  wateringLogContent,
  waterPanel,
  WATER_BUTTON_ID
} from "./presentation.js";

function entry(userId: string, age: number, size: number): RankingEntry {
  return {
    id: userId,
    guildId: "1",
    userId,
    generation: 1,
    ownerDisplayName: userId,
    name: `${userId}のまりも`,
    bornAt: new Date("2026-01-01T00:00:00Z"),
    lastWateredAt: new Date("2026-08-10T00:00:00Z"),
    lastWateredDate: "2026-08-10",
    ageDays: age,
    sizeMm: size
  };
}

function deadEntry(
  userId: string,
  generation: number,
  finalSizeMm: number
): DeadMarimo {
  return {
    ...entry(userId, 1, finalSizeMm),
    generation,
    diedAt: new Date(
      `2026-08-${String(generation + 10).padStart(2, "0")}T15:00:00Z`
    ),
    finalSizeMm
  };
}

describe("Discord presentation", () => {
  it.each([
    [1, false],
    [2, true],
    [3, true],
    [4, false],
    [5, true],
    [6, false],
    [9, false],
    [10, true],
    [11, false],
    [19, false],
    [20, true],
    [100, true]
  ])("classifies a %i-day care streak milestone", (ageDays, expected) => {
    expect(isCareStreakMilestone(ageDays)).toBe(expected);
  });

  it("explains the hard reset and exact daily XP", () => {
    const panel = waterPanel(100);
    const embed = panel.embeds[0]?.toJSON();
    expect(panel.content).toBe("");
    expect(panel.flags).toEqual([]);
    expect(panel.embeds).toHaveLength(1);
    expect(embed?.title).toBe("🟢 まりもちゃん");
    expect(embed?.description).toBe(
      [
        "🌱 **まりもを育てよう**",
        "下のボタンを押すと、自分のまりもが生まれます。",
        "まりもは時間とともに、どこまでも大きくなります。",
        "",
        "🫧 **お世話は1日1回**",
        "毎日水を替えて、まりもを育てましょう。",
        "",
        "✨ **もらえるXP**",
        "・育て始めた日：**100 XP**",
        "・連続飼育：1日ごとに **+10 XP**",
        "・最大：**500 XP**",
        "",
        "⚠️ **水替えを忘れると…**",
        "丸一日忘れると枯れてしまいます。",
        "枯れたまりもは **1,000 XP**で生き返らせることもできます。",
        "新しく育て直す場合は **100 XP**から再スタートします。"
      ].join("\n")
    );
    expect(embed?.footer?.text).toBe("日付は日本時間の0:00に切り替わります");
    expect(panel.components[0]?.components).toHaveLength(4);
    expect(
      panel.components[0]?.components.map((component) => component.toJSON())
    ).toContainEqual(expect.objectContaining({ custom_id: NAME_BUTTON_ID }));
    expect(
      panel.components[0]?.components.map((component) => component.toJSON())
    ).toContainEqual(
      expect.objectContaining({
        custom_id: WATER_BUTTON_ID,
        label: "育て始める・水を替える"
      })
    );
    expect(
      panel.components[0]?.components.map((component) => component.toJSON())
    ).toContainEqual(
      expect.objectContaining({
        custom_id: STATUS_BUTTON_ID,
        label: "自分のまりもを見る"
      })
    );
    expect(
      panel.components[0]?.components.map((component) => component.toJSON())
    ).toContainEqual(
      expect.objectContaining({
        custom_id: REVIVE_BUTTON_ID,
        label: "1,000 XPで復活"
      })
    );
  });

  it("opens a constrained name modal from the panel", () => {
    const modal = nameModal().toJSON();
    expect(modal).toMatchObject({
      custom_id: NAME_MODAL_ID,
      components: [
        {
          component: {
            custom_id: NAME_INPUT_ID,
            min_length: 1,
            max_length: 32,
            required: true
          }
        }
      ]
    });
  });

  it("ranks only by marimo size", () => {
    const entries = [entry("young-large", 2, 99), entry("old-small", 20, 12)];
    const updated = new Date("2026-08-10T00:00:00Z");

    const panel = rankingPanel(entries, updated);
    const ranking = [
      panel.embeds[0]?.data.title,
      panel.embeds[0]?.data.description
    ].join("\n");

    expect(panel.content).toBe("");
    expect(panel.components).toEqual([]);
    expect(panel.flags).toEqual([]);
    expect(ranking).toContain("巨大まりもランキング");
    expect(ranking).not.toContain("ご長寿");
    expect(ranking).toContain("99.00 mm");
    expect(ranking).not.toContain("生後");
    expect(ranking.indexOf("young-large")).toBeLessThan(
      ranking.indexOf("old-small")
    );
  });

  it("gives every displayed size tie the same rank", () => {
    const ranking = rankingPanel(
      [
        entry("same-a", 2, 99),
        entry("same-b", 20, 99.001),
        entry("smaller", 30, 12)
      ],
      new Date("2026-08-10T00:00:00Z")
    ).embeds[0]?.data.description;

    expect(ranking).toContain("**1位**｜<@same-a>");
    expect(ranking).toContain("**1位**｜<@same-b>");
    expect(ranking).toContain("**3位**｜<@smaller>");
    expect(ranking).not.toMatch(/^\d+\. /m);
    expect(ranking).not.toContain("https://");
  });

  it("includes every participant when more than ten marimos are alive", () => {
    const entries = Array.from({ length: 11 }, (_, index) =>
      entry(`owner-${index + 1}`, 1, 10)
    );
    const ranking = rankingPanel(entries, new Date("2026-08-10T00:00:00Z"))
      .embeds[0]?.data.description;

    expect(ranking).toContain("<@owner-1>");
    expect(ranking).toContain("<@owner-10>");
    expect(ranking).toContain("<@owner-11>");
    expect(ranking?.match(/<@owner-/g)).toHaveLength(11);
  });

  it("ranks dead marimos separately by final size with displayed-size ties", () => {
    const panel = deadRankingPanel(
      [
        deadEntry("small", 3, 12),
        deadEntry("large-a", 1, 99),
        deadEntry("large-b", 2, 99.001)
      ],
      new Date("2026-08-20T00:00:00Z")
    );
    const ranking = [
      panel.embeds[0]?.data.title,
      panel.embeds[0]?.data.description
    ].join("\n");

    expect(panel.content).toBe("");
    expect(panel.components).toEqual([]);
    expect(panel.flags).toEqual([]);
    expect(ranking).toContain("🥀 枯れたまりも大きさランキング");
    expect(ranking).toContain("**1位**｜<@large-a>｜**99.00 mm**｜第1世代");
    expect(ranking).toContain("**1位**｜<@large-b>｜**99.00 mm**｜第2世代");
    expect(ranking).toContain("**3位**｜<@small>｜**12.00 mm**｜第3世代");
    expect(ranking.indexOf("large-a")).toBeLessThan(ranking.indexOf("small"));
  });

  it("explains when the dead marimo ranking is empty", () => {
    const ranking = deadRankingPanel([], new Date("2026-08-20T00:00:00Z"))
      .embeds[0]?.data.description;

    expect(ranking).toContain("まだ枯れたまりもはいません。");
  });

  it("announces a first interaction as a birth, not a water change", () => {
    const marimo = entry("new-owner", 1, 10);
    const base = {
      eventId: "00000000-0000-4000-8000-000000000001",
      marimo,
      wateredAt: new Date("2026-08-10T00:00:00Z"),
      wateredDate: "2026-08-10",
      sizeMm: 10,
      ageDays: 1,
      awardedXp: 100,
      dialogueId: null
    };

    const birth = wateringLogContent({ ...base, isBirth: true });
    const care = wateringLogContent({ ...base, isBirth: false });

    expect(birth).toContain("が生まれました");
    expect(birth).not.toContain("水を替えました");
    expect(care).toContain("水を替えました");
    expect(care).not.toContain("が生まれました");
    expect(birth).toContain("<@new-owner>");
    expect(care).toContain("<@new-owner>");
    expect(birth).not.toContain("https://");
    expect(care).not.toContain("https://");
  });

  it("adds a celebration only to milestone watering logs", () => {
    const marimo = entry("owner", 2, 10.3);
    const base = {
      eventId: "00000000-0000-4000-8000-000000000001",
      marimo,
      wateredAt: new Date("2026-08-11T00:00:00Z"),
      wateredDate: "2026-08-11",
      sizeMm: 10.3,
      awardedXp: 110,
      isBirth: false,
      dialogueId: null
    };

    const milestone = wateringLogContent({ ...base, ageDays: 2 });
    const ordinary = wateringLogContent({ ...base, ageDays: 4 });

    expect(milestone).toContain("🎉 **連続飼育 2日達成！**");
    expect(milestone).toContain("おめでとうございます！");
    expect(ordinary).not.toContain("🎉");
    expect(ordinary).not.toContain("おめでとうございます");
  });

  it("adds the persisted marimo line to new logs but not historical logs", () => {
    const marimo = entry("owner", 4, 10.9);
    const base = {
      eventId: "00000000-0000-4000-8000-000000000001",
      marimo,
      wateredAt: new Date("2026-08-13T00:00:00Z"),
      wateredDate: "2026-08-13",
      sizeMm: 10.9,
      ageDays: 4,
      awardedXp: 130,
      isBirth: false
    };
    const dialogueId = "everyday-01-01";
    const dialogue = marimoDialogueText(dialogueId);
    expect(dialogue).not.toBeNull();

    const spoken = wateringLogContent({ ...base, dialogueId });
    const historical = wateringLogContent({ ...base, dialogueId: null });

    expect(spoken).toContain(`> 🟢 まりも「${dialogue}」`);
    expect(historical).not.toContain("> 🟢 まりも「");
  });

  it("keeps Discord user mention syntax without URL links in death logs", () => {
    const living = entry("owner", 1, 10);
    const dead = {
      ...living,
      diedAt: new Date("2026-08-11T15:00:00Z"),
      finalSizeMm: 10.3
    };

    const memorial = deathLogContent(dead);

    expect(memorial).toContain("<@owner>");
    expect(memorial).not.toContain("https://");
  });

  it("shows the next increasing XP reward in personal status", () => {
    const marimo = {
      ...entry("owner", 2, 10.3),
      lastWateredDate: "2026-08-11"
    };

    const status = statusContent(marimo, 100, new Date("2026-08-11T03:00:00Z"));

    expect(status).toContain("連続飼育 **2日**");
    expect(status).toContain("次の水替え **120 XP**");
  });

  it("shows today's persisted marimo line in personal status", () => {
    const marimo = {
      ...entry("owner", 4, 10.9),
      lastWateredDate: "2026-08-13"
    };
    const dialogueId = "everyday-01-01";
    const dialogue = marimoDialogueText(dialogueId);
    expect(dialogue).not.toBeNull();

    const status = statusContent(
      marimo,
      100,
      new Date("2026-08-13T03:00:00Z"),
      dialogueId
    );
    const withoutTodayDialogue = statusContent(
      marimo,
      100,
      new Date("2026-08-13T03:00:00Z"),
      null
    );

    expect(status).toContain(`> 🟢 まりも「${dialogue}」`);
    expect(withoutTodayDialogue).not.toContain("> 🟢 まりも「");
  });

  it("escapes formatting characters in user-defined marimo names", () => {
    const marimo = { ...entry("owner", 1, 10), name: "**巨大**_まりも_" };
    const status = rankingPanel([marimo], new Date("2026-08-10T00:00:00Z"))
      .embeds[0]?.data.description;

    expect(status).toContain("\\*\\*巨大\\*\\*\\_まりも\\_");
    expect(status).not.toContain("｜**巨大**_まりも_");
  });
});
