import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate.js";
import { MarimoRepository } from "./repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("MarimoRepository integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new MarimoRepository(pool);

  beforeAll(async () => {
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE marimo_xp_awards, marimo_waterings, marimos, marimo_guild_configs RESTART IDENTITY CASCADE"
    );
  });

  afterAll(async () => pool.end());

  it("wires daily care, XP, death reset, and rankings atomically", async () => {
    const first = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-10T03:00:00Z"),
      awardedXp: 10
    });
    const duplicate = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-10T08:00:00Z"),
      awardedXp: 10
    });
    const nextGeneration = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-12T15:00:00Z"),
      awardedXp: 10
    });

    expect(first.status).toBe("watered");
    expect(duplicate.status).toBe("already-watered");
    expect(nextGeneration.status).toBe("watered");
    if (nextGeneration.status !== "watered")
      throw new Error("expected watering");
    expect(nextGeneration.death?.generation).toBe(1);
    expect(nextGeneration.watering.marimo.generation).toBe(2);

    const awards = await repository.pendingXp();
    expect(awards).toHaveLength(2);
    expect(awards.map((award) => award.awardedXp)).toEqual([10, 10]);

    const rankings = await repository.rankings(
      "1001",
      new Date("2026-08-12T15:00:00Z")
    );
    expect(rankings).toHaveLength(1);
    expect(rankings[0]?.generation).toBe(2);
  });

  it("uses the exact Japanese midnight death boundary", async () => {
    const input = {
      guildId: "1002",
      userId: "2002",
      channelId: "3002",
      displayName: "境界",
      awardedXp: 10
    };
    await repository.water({
      ...input,
      now: new Date("2026-08-10T14:59:59.000Z")
    });

    const stillAlive = await repository.getLiving(
      input.guildId,
      input.userId,
      new Date("2026-08-11T14:59:59.999Z")
    );
    const deadAtBoundary = await repository.getLiving(
      input.guildId,
      input.userId,
      new Date("2026-08-11T15:00:00.000Z")
    );
    expect(stillAlive).not.toBeNull();
    expect(deadAtBoundary).toBeNull();

    const next = await repository.water({
      ...input,
      now: new Date("2026-08-11T15:00:00.000Z")
    });
    expect(next.status).toBe("watered");
    if (next.status !== "watered") throw new Error("expected watering");
    expect(next.death?.diedAt.toISOString()).toBe("2026-08-11T15:00:00.000Z");
    expect(next.watering.marimo.generation).toBe(2);

    const duplicate = await repository.water({
      ...input,
      now: new Date("2026-08-11T15:00:00.001Z")
    });
    expect(duplicate.status).toBe("already-watered");

    const awards = await repository.pendingXp();
    expect(
      awards.filter((award) => award.guildId === input.guildId)
    ).toHaveLength(2);
  });

  it("clears the retired age leaderboard configuration", async () => {
    await pool.query(
      `INSERT INTO marimo_guild_configs (
         guild_id, age_panel_channel_id, age_panel_message_id
       ) VALUES ($1, $2, $3)`,
      ["1003", "3003", "4003"]
    );

    await repository.clearAgePanel("1003");

    const config = await repository.getConfig("1003");
    expect(config.agePanelChannelId).toBeNull();
    expect(config.agePanelMessageId).toBeNull();
  });
});
