import { describe, expect, it } from "vitest";
import type { RankingEntry } from "../domain/types.js";
import {
  currentMarimoLogContent,
  deathLogContent,
  nameModal,
  NAME_BUTTON_ID,
  NAME_INPUT_ID,
  NAME_MODAL_ID,
  rankingContent,
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
    expect(panel.content).toContain("自分のまりもが生まれ、**100 XP**");
    expect(panel.content).toContain("1日1回");
    expect(panel.content).toContain("100 XP");
    expect(panel.content).toContain("枯れてしまい");
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

    const ranking = rankingContent(entries, updated);

    expect(ranking).toContain("巨大まりもランキング");
    expect(ranking).not.toContain("ご長寿");
    expect(ranking).toContain("99.00 mm");
    expect(ranking).not.toContain("生後");
    expect(ranking.indexOf("young-large")).toBeLessThan(
      ranking.indexOf("old-small")
    );
  });

  it("gives every displayed size tie the same rank", () => {
    const ranking = rankingContent(
      [
        entry("same-a", 2, 99),
        entry("same-b", 20, 99.001),
        entry("smaller", 30, 12)
      ],
      new Date("2026-08-10T00:00:00Z")
    );

    expect(ranking).toContain("**1位**｜<@same-a>");
    expect(ranking).toContain("**1位**｜<@same-b>");
    expect(ranking).toContain("**3位**｜<@smaller>");
    expect(ranking).not.toMatch(/^\d+\. /m);
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
  });

  it("keeps user mentions in every image log", () => {
    const living = entry("owner", 1, 10);
    const dead = {
      ...living,
      diedAt: new Date("2026-08-11T15:00:00Z"),
      finalSizeMm: 10.3
    };

    const current = currentMarimoLogContent(living);
    const memorial = deathLogContent(dead);

    expect(current).toContain("<@owner>");
    expect(memorial).toContain("<@owner>");
  });

  it("escapes formatting characters in user-defined marimo names", () => {
    const marimo = { ...entry("owner", 1, 10), name: "**巨大**_まりも_" };
    const status = rankingContent([marimo], new Date("2026-08-10T00:00:00Z"));

    expect(status).toContain("\\*\\*巨大\\*\\*\\_まりも\\_");
    expect(status).not.toContain("｜**巨大**_まりも_");
  });
});
