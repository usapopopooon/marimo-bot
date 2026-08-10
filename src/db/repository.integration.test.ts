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
      awardedXp: 100
    });
    const duplicate = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-10T08:00:00Z"),
      awardedXp: 100
    });
    const continued = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-11T03:00:00Z"),
      awardedXp: 100
    });
    const nextGeneration = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-12T15:00:00Z"),
      awardedXp: 100
    });

    expect(first.status).toBe("watered");
    expect(duplicate.status).toBe("already-watered");
    expect(continued.status).toBe("watered");
    expect(nextGeneration.status).toBe("watered");
    if (first.status !== "watered" || continued.status !== "watered")
      throw new Error("expected watering");
    if (nextGeneration.status !== "watered")
      throw new Error("expected watering");
    expect(first.watering.isBirth).toBe(true);
    expect(continued.watering.isBirth).toBe(false);
    expect(nextGeneration.death?.generation).toBe(1);
    expect(nextGeneration.watering.marimo.generation).toBe(2);
    expect(nextGeneration.watering.isBirth).toBe(true);

    const awards = await repository.pendingXp();
    expect(awards).toHaveLength(3);
    expect(awards.map((award) => award.awardedXp)).toEqual([100, 100, 100]);

    const rankings = await repository.rankings(
      "1001",
      new Date("2026-08-12T15:00:00Z")
    );
    expect(rankings).toHaveLength(1);
    expect(rankings[0]?.generation).toBe(2);

    const pendingLogs = (await repository.pendingWateringLogs()).filter(
      (watering) => watering.marimo.guildId === "1001"
    );
    expect(pendingLogs).toHaveLength(3);
    expect(pendingLogs.map((watering) => watering.isBirth)).toEqual([
      true,
      false,
      true
    ]);
    const firstLog = pendingLogs[0];
    if (firstLog === undefined) throw new Error("expected watering log");
    await repository.markWateringLogFailed(firstLog.eventId, "send failed");
    expect(
      (await repository.pendingWateringLogs()).find(
        (watering) => watering.eventId === firstLog.eventId
      )?.deliveryAttempts
    ).toBe(1);
    await repository.markWateringLogDelivered(firstLog.eventId);
    expect(
      (await repository.pendingWateringLogs()).some(
        (watering) => watering.eventId === firstLog.eventId
      )
    ).toBe(false);
    await repository.markGuildWateringLogsDeliveredThrough(
      "1001",
      new Date("2026-08-11T04:00:00Z")
    );
    expect(
      (await repository.pendingWateringLogs()).filter(
        (watering) => watering.marimo.guildId === "1001"
      )
    ).toHaveLength(1);
    await repository.markGuildWateringLogsDeliveredThrough(
      "1001",
      new Date("2026-08-13T00:00:00Z")
    );
    expect(
      (await repository.pendingWateringLogs()).filter(
        (watering) => watering.marimo.guildId === "1001"
      )
    ).toHaveLength(0);
  });

  it("uses the exact Japanese midnight death boundary", async () => {
    const input = {
      guildId: "1002",
      userId: "2002",
      channelId: "3002",
      displayName: "境界",
      awardedXp: 100
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

  it("grants the XP difference once for both delivered and uncertain old awards", async () => {
    const delivered = await repository.water({
      guildId: "1004",
      userId: "2004",
      channelId: "3004",
      displayName: "配信済み",
      now: new Date("2026-08-10T03:00:00Z"),
      awardedXp: 10
    });
    if (delivered.status !== "watered") throw new Error("expected watering");
    await repository.markXpDelivered(delivered.watering.eventId);
    const uncertain = await repository.water({
      guildId: "1005",
      userId: "2005",
      channelId: "3005",
      displayName: "配信不明",
      now: new Date("2026-08-10T03:00:00Z"),
      awardedXp: 10
    });
    if (uncertain.status !== "watered") throw new Error("expected watering");
    await repository.markXpFailed(uncertain.watering.eventId, "timeout");

    await repository.backfillWateringXp(100);
    await repository.backfillWateringXp(100);

    const pending = await repository.pendingXp();
    expect(
      pending
        .filter((award) => award.guildId === "1004")
        .map((award) => award.awardedXp)
    ).toEqual([90]);
    expect(
      pending
        .filter((award) => award.guildId === "1005")
        .map((award) => award.awardedXp)
    ).toEqual([90, 10]);
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
