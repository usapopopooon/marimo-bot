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
      "TRUNCATE marimo_allowed_roles, marimo_revivals, marimo_xp_awards, marimo_waterings, marimos, marimo_guild_configs RESTART IDENTITY CASCADE"
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
      baseXp: 100
    });
    expect(first.status).toBe("watered");
    if (first.status !== "watered") throw new Error("expected watering");
    expect(
      (
        await repository.getLiving(
          "1001",
          "2001",
          new Date("2026-08-10T08:00:00Z")
        )
      )?.dialogueId
    ).toBe(first.watering.dialogueId);
    expect(
      (
        await repository.getLiving(
          "1001",
          "2001",
          new Date("2026-08-10T15:01:00Z")
        )
      )?.dialogueId
    ).toBeNull();
    const duplicate = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-10T08:00:00Z"),
      baseXp: 100
    });
    const continued = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-11T03:00:00Z"),
      baseXp: 100
    });
    const nextGeneration = await repository.water({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "客",
      now: new Date("2026-08-12T15:00:00Z"),
      baseXp: 100
    });

    expect(duplicate.status).toBe("already-watered");
    expect(continued.status).toBe("watered");
    expect(nextGeneration.status).toBe("watered");
    if (continued.status !== "watered") throw new Error("expected watering");
    if (nextGeneration.status !== "watered")
      throw new Error("expected watering");
    expect(first.watering.isBirth).toBe(true);
    expect(continued.watering.isBirth).toBe(false);
    expect(nextGeneration.death?.generation).toBe(1);
    expect(nextGeneration.watering.marimo.generation).toBe(2);
    expect(nextGeneration.watering.isBirth).toBe(true);
    expect(first.watering.dialogueId).toMatch(/^birth-/);
    expect(continued.watering.dialogueId).toMatch(/^milestone-/);
    expect(nextGeneration.watering.dialogueId).toMatch(/^birth-/);
    expect(
      new Set([
        first.watering.dialogueId,
        continued.watering.dialogueId,
        nextGeneration.watering.dialogueId
      ]).size
    ).toBe(3);

    const awards = await repository.pendingXp();
    expect(awards).toHaveLength(3);
    expect(awards.map((award) => award.awardedXp)).toEqual([100, 110, 100]);

    const rankings = await repository.rankings(
      "1001",
      new Date("2026-08-12T15:00:00Z")
    );
    expect(rankings).toHaveLength(1);
    expect(rankings[0]?.generation).toBe(2);
    const deadRankings = await repository.deadRankings("1001");
    expect(deadRankings).toHaveLength(1);
    expect(deadRankings[0]).toMatchObject({
      userId: "2001",
      generation: 1,
      finalSizeMm: 10.9
    });

    const pendingLogs = (await repository.pendingWateringLogs()).filter(
      (watering) => watering.marimo.guildId === "1001"
    );
    expect(pendingLogs).toHaveLength(3);
    expect(pendingLogs.map((watering) => watering.isBirth)).toEqual([
      true,
      false,
      true
    ]);
    expect(pendingLogs.map((watering) => watering.awardedXp)).toEqual([
      100, 110, 100
    ]);
    expect(pendingLogs.map((watering) => watering.dialogueId)).toEqual([
      first.watering.dialogueId,
      continued.watering.dialogueId,
      nextGeneration.watering.dialogueId
    ]);
    const fullWateringHistory = await repository.wateringLogHistory(
      "1001",
      new Date("2026-08-13T00:00:00Z")
    );
    expect(fullWateringHistory.map((event) => event.eventId)).toEqual([
      first.watering.eventId,
      continued.watering.eventId,
      nextGeneration.watering.eventId
    ]);
    expect(fullWateringHistory.map((event) => event.awardedXp)).toEqual([
      100, 110, 100
    ]);
    expect(fullWateringHistory.map((event) => event.dialogueId)).toEqual([
      first.watering.dialogueId,
      continued.watering.dialogueId,
      nextGeneration.watering.dialogueId
    ]);
    expect(
      await repository.wateringLogHistory(
        "1001",
        new Date("2026-08-11T04:00:00Z")
      )
    ).toHaveLength(2);
    const deathHistory = await repository.deathLogHistory(
      "1001",
      new Date("2026-08-13T00:00:00Z")
    );
    expect(deathHistory).toHaveLength(1);
    expect(deathHistory[0]?.generation).toBe(1);
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
      baseXp: 100
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

  it("ranks different start times on the same JST date at the same daily size", async () => {
    const input = {
      guildId: "1006",
      channelId: "3006",
      displayName: "同日組",
      baseXp: 100
    };
    await repository.water({
      ...input,
      userId: "2006",
      now: new Date("2026-08-10T03:00:00.000Z")
    });
    await repository.water({
      ...input,
      userId: "2007",
      now: new Date("2026-08-10T14:59:59.999Z")
    });

    const rankings = (
      await repository.rankings(
        input.guildId,
        new Date("2026-08-10T15:01:00.000Z")
      )
    ).sort((left, right) => left.userId.localeCompare(right.userId));

    expect(
      rankings.map((entry) => ({
        userId: entry.userId,
        ageDays: entry.ageDays,
        sizeMm: entry.sizeMm
      }))
    ).toEqual([
      { userId: "2006", ageDays: 2, sizeMm: 10.3 },
      { userId: "2007", ageDays: 2, sizeMm: 10.3 }
    ]);
  });

  it("caps long-running care at 500 XP in logs and the XP outbox", async () => {
    const awarded: number[] = [];
    const eventIds: string[] = [];
    for (let day = 0; day < 42; day += 1) {
      const result = await repository.water({
        guildId: "1007",
        userId: "2008",
        channelId: "3007",
        displayName: "長期飼育",
        now: new Date(Date.UTC(2026, 7, 1 + day, 3)),
        baseXp: 100
      });
      if (result.status !== "watered") throw new Error("expected watering");
      awarded.push(result.watering.awardedXp);
      eventIds.push(result.watering.eventId);
    }

    expect([
      awarded[0],
      awarded[1],
      awarded[39],
      awarded[40],
      awarded[41]
    ]).toEqual([100, 110, 490, 500, 500]);
    const logAwards = (await repository.pendingWateringLogs(100))
      .filter((watering) => watering.marimo.guildId === "1007")
      .map((watering) => watering.awardedXp);
    const outboxAwards = (await repository.pendingXp(100))
      .filter((award) => award.guildId === "1007")
      .map((award) => award.awardedXp);
    expect(logAwards).toEqual(awarded);
    expect(outboxAwards).toEqual(awarded);
    for (const eventId of eventIds) {
      await repository.markWateringLogDelivered(eventId);
      await repository.markXpDelivered(eventId);
    }
  });

  it("grants the XP difference once for both delivered and uncertain old awards", async () => {
    const delivered = await repository.water({
      guildId: "1004",
      userId: "2004",
      channelId: "3004",
      displayName: "配信済み",
      now: new Date("2026-08-10T03:00:00Z"),
      baseXp: 10
    });
    if (delivered.status !== "watered") throw new Error("expected watering");
    await repository.markXpDelivered(delivered.watering.eventId);
    const uncertain = await repository.water({
      guildId: "1005",
      userId: "2005",
      channelId: "3005",
      displayName: "配信不明",
      now: new Date("2026-08-10T03:00:00Z"),
      baseXp: 10
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

  it("stores multiple allowed roles idempotently and removes them", async () => {
    expect(await repository.allowedRoleIds("1007")).toEqual([]);
    expect(await repository.addAllowedRole("1007", "5001")).toBe(true);
    expect(await repository.addAllowedRole("1007", "5001")).toBe(false);
    expect(await repository.addAllowedRole("1007", "5002")).toBe(true);
    expect(await repository.allowedRoleIds("1007")).toEqual(["5001", "5002"]);
    expect(await repository.removeAllowedRole("1007", "5001")).toBe(true);
    expect(await repository.removeAllowedRole("1007", "5001")).toBe(false);
    expect(await repository.allowedRoleIds("1007")).toEqual(["5002"]);
  });

  it("prepares and completes an idempotent revival without growing while dead", async () => {
    const input = {
      guildId: "1008",
      userId: "2009",
      channelId: "3008",
      displayName: "復活組",
      baseXp: 100
    };
    const born = await repository.water({
      ...input,
      now: new Date("2026-08-10T03:00:00Z")
    });
    expect(born.status).toBe("watered");
    const death = await repository.expireOne(
      input.guildId,
      input.userId,
      new Date("2026-08-11T15:00:00Z")
    );
    expect(death?.finalSizeMm).toBe(10.6);
    expect(await repository.deadRankings(input.guildId)).toEqual([death]);

    const first = await repository.prepareRevival({
      guildId: input.guildId,
      userId: input.userId,
      channelId: input.channelId,
      now: new Date("2026-08-14T03:00:00Z")
    });
    const retry = await repository.prepareRevival({
      guildId: input.guildId,
      userId: input.userId,
      channelId: input.channelId,
      now: new Date("2026-08-14T04:00:00Z")
    });
    expect(first.status).toBe("ready");
    expect(retry.status).toBe("ready");
    if (first.status !== "ready" || retry.status !== "ready")
      throw new Error("expected revival preparation");
    expect(retry.eventId).toBe(first.eventId);
    expect(retry.requestedAt).toEqual(first.requestedAt);

    const blockedWatering = await repository.water({
      ...input,
      now: new Date("2026-08-14T04:00:00Z")
    });
    expect(blockedWatering.status).toBe("revival-pending");
    await pool.query(
      "UPDATE marimo_revivals SET cost_xp = 3000 WHERE event_id = $1",
      [first.eventId]
    );

    const revived = await repository.completeRevival({
      eventId: first.eventId,
      guildId: input.guildId,
      userId: input.userId,
      displayName: input.displayName,
      costXp: 1000,
      now: new Date("2026-08-14T03:00:00Z")
    });
    expect(revived.generation).toBe(1);
    expect(revived.name).toBe("復活組のまりも");
    expect(revived.ageDays).toBe(3);
    expect(revived.sizeMm).toBe(10.6);
    expect(revived.costXp).toBe(1000);
    expect(await repository.deadRankings(input.guildId)).toEqual([]);

    const completedAgain = await repository.completeRevival({
      eventId: first.eventId,
      guildId: input.guildId,
      userId: input.userId,
      displayName: input.displayName,
      costXp: 1000,
      now: new Date("2026-08-14T03:00:00Z")
    });
    expect(completedAgain.id).toBe(revived.id);
    expect(completedAgain.sizeMm).toBe(10.6);

    const sameDayWatering = await repository.water({
      ...input,
      now: new Date("2026-08-14T05:00:00Z")
    });
    expect(sameDayWatering.status).toBe("already-watered");
    const history = await repository.deathLogHistory(
      input.guildId,
      new Date("2026-08-15T00:00:00Z")
    );
    expect(history).toHaveLength(1);
    expect(history[0]?.generation).toBe(1);
    expect(history[0]?.finalSizeMm).toBe(10.6);
  });

  it("cancels an unpaid revival so a new generation can start", async () => {
    const input = {
      guildId: "1009",
      userId: "2010",
      channelId: "3009",
      displayName: "再出発",
      baseXp: 100
    };
    await repository.water({
      ...input,
      now: new Date("2026-08-10T03:00:00Z")
    });
    await repository.expireOne(
      input.guildId,
      input.userId,
      new Date("2026-08-11T15:00:00Z")
    );
    const preparation = await repository.prepareRevival({
      guildId: input.guildId,
      userId: input.userId,
      channelId: input.channelId,
      now: new Date("2026-08-12T03:00:00Z")
    });
    if (preparation.status !== "ready")
      throw new Error("expected revival preparation");
    await repository.cancelRevival({
      eventId: preparation.eventId,
      guildId: input.guildId,
      userId: input.userId
    });

    const next = await repository.water({
      ...input,
      now: new Date("2026-08-12T03:00:00Z")
    });
    expect(next.status).toBe("watered");
    if (next.status !== "watered") throw new Error("expected watering");
    expect(next.watering.marimo.generation).toBe(2);
  });
});
