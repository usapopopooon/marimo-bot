import { describe, expect, it } from "vitest";
import type { RankingEntry } from "../domain/types.js";
import {
  deathLogContent,
  nameModal,
  NAME_BUTTON_ID,
  NAME_INPUT_ID,
  NAME_MODAL_ID,
  rankingPanel,
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

describe("Discord presentation", () => {
  it("explains the hard reset and exact daily XP", () => {
    const panel = waterPanel(100);
    const embed = panel.embeds[0]?.toJSON();
    expect(panel.content).toBe("");
    expect(panel.flags).toEqual([]);
    expect(panel.embeds).toHaveLength(1);
    expect(embed?.title).toBe("🟢 まりもちゃん");
    expect(embed?.description).toContain("自分のまりもが生まれ、**100 XP**");
    expect(embed?.description).toContain("1日1回");
    expect(embed?.description).toContain("100 XP");
    expect(embed?.description).toContain("+10 XP");
    expect(embed?.description).toContain("最大 **500 XP**");
    expect(embed?.description).toContain("100 XP**から再スタート");
    expect(embed?.description).toContain("枯れてしまい");
    expect(embed?.footer?.text).toBe("日付は日本時間の0:00に切り替わります");
    expect(panel.components[0]?.components).toHaveLength(3);
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

  it("announces a first interaction as a birth, not a water change", () => {
    const marimo = entry("new-owner", 1, 10);
    const base = {
      eventId: "00000000-0000-4000-8000-000000000001",
      marimo,
      wateredAt: new Date("2026-08-10T00:00:00Z"),
      wateredDate: "2026-08-10",
      sizeMm: 10,
      ageDays: 1,
      awardedXp: 100
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

  it("escapes formatting characters in user-defined marimo names", () => {
    const marimo = { ...entry("owner", 1, 10), name: "**巨大**_まりも_" };
    const status = rankingPanel([marimo], new Date("2026-08-10T00:00:00Z"))
      .embeds[0]?.data.description;

    expect(status).toContain("\\*\\*巨大\\*\\*\\_まりも\\_");
    expect(status).not.toContain("｜**巨大**_まりも_");
  });
});
