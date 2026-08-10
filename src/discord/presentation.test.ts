import { describe, expect, it } from "vitest";
import type { RankingEntry } from "../domain/types.js";
import {
  nameModal,
  NAME_BUTTON_ID,
  NAME_INPUT_ID,
  NAME_MODAL_ID,
  rankingContent,
  waterPanel
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
    const panel = waterPanel(10);
    expect(panel.content).toContain("1日1回");
    expect(panel.content).toContain("10 XP");
    expect(panel.content).toContain("枯れてしまい");
    expect(panel.components[0]?.components).toHaveLength(3);
    expect(
      panel.components[0]?.components.map((component) => component.toJSON())
    ).toContainEqual(expect.objectContaining({ custom_id: NAME_BUTTON_ID }));
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

  it("maps age and size to their correct ranking consumers", () => {
    const entries = [entry("young-large", 2, 99), entry("old-small", 20, 12)];
    const updated = new Date("2026-08-10T00:00:00Z");

    const age = rankingContent(entries, "age", updated);
    const size = rankingContent(entries, "size", updated);

    expect(age.indexOf("old-small")).toBeLessThan(age.indexOf("young-large"));
    expect(size.indexOf("young-large")).toBeLessThan(size.indexOf("old-small"));
  });
});
