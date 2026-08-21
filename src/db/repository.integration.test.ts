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
      "TRUNCATE marimo_watering_reminder_preferences, marimo_allowed_roles, marimo_revivals, marimo_xp_awards, marimo_waterings, marimos, marimo_guild_configs RESTART IDENTITY CASCADE"
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

  it("passes the watering time into contextual late-night dialogue selection", async () => {
    const dialogueIds: string[] = [];
    for (let day = 0; day < 8; day += 1) {
      const result = await repository.water({
        guildId: "1013",
        userId: "2015",
        channelId: "3013",
        displayName: "夜ふかし組",
        now: new Date(Date.UTC(2026, 7, 1 + day, 15)),
        baseXp: 100
      });
      if (result.status !== "watered") throw new Error("expected watering");
      if (result.watering.dialogueId === null)
        throw new Error("expected dialogue");
      dialogueIds.push(result.watering.dialogueId);
    }

    expect(dialogueIds[0]).toMatch(/^birth-/);
    expect(dialogueIds[1]).toMatch(/^milestone-/);
    expect(dialogueIds[3]).toMatch(/^latenight-/);
    expect(dialogueIds[7]).toMatch(/^latenight-/);
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

  it("keeps reminders opt-in, claims them once, and stops after five failures", async () => {
    const guildId = "1010";
    const userId = "2011";
    await repository.setLogChannel(guildId, "3010");
    await repository.water({
      guildId,
      userId,
      channelId: "3011",
      displayName: "通知希望",
      now: new Date("2026-08-10T03:00:00Z"),
      baseXp: 100
    });

    expect(
      await repository.getWateringReminderHour(guildId, userId)
    ).toBeNull();
    expect(
      await repository.claimDueWateringReminders(
        new Date("2026-08-11T11:59:59Z")
      )
    ).toEqual([]);

    await repository.setWateringReminderHour(guildId, userId, 21);
    expect(await repository.getWateringReminderHour(guildId, userId)).toBe(21);
    expect(
      await repository.claimDueWateringReminders(
        new Date("2026-08-11T11:59:59Z")
      )
    ).toEqual([]);

    const dueAtNine = new Date("2026-08-11T12:00:00Z");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const claimed = await repository.claimDueWateringReminders(dueAtNine);
      expect(claimed).toEqual([
        {
          guildId,
          userId,
          marimoName: "通知希望のまりも",
          logChannelId: "3010",
          reminderHour: 21,
          reminderDate: "2026-08-11"
        }
      ]);
      expect(
        await repository.wateringReminderStillDue(guildId, userId, "2026-08-11")
      ).toBe(true);
      await repository.releaseWateringReminderClaim(
        guildId,
        userId,
        "2026-08-11"
      );
    }
    expect(await repository.claimDueWateringReminders(dueAtNine)).toEqual([]);

    await repository.setWateringReminderHour(guildId, userId, null);
    expect(
      await repository.getWateringReminderHour(guildId, userId)
    ).toBeNull();
  });

  it("does not remind after today's care or after the marimo has died", async () => {
    const guildId = "1011";
    await repository.setLogChannel(guildId, "3011");
    for (const [userId, wateredAt] of [
      ["2012", "2026-08-11T03:00:00Z"],
      ["2013", "2026-08-09T03:00:00Z"]
    ] as const) {
      await repository.water({
        guildId,
        userId,
        channelId: "3012",
        displayName: userId,
        now: new Date(wateredAt),
        baseXp: 100
      });
      await repository.setWateringReminderHour(guildId, userId, 21);
    }

    expect(
      await repository.claimDueWateringReminders(
        new Date("2026-08-11T12:00:00Z")
      )
    ).toEqual([]);
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
    if (death === null) throw new Error("expected death");
    expect(death.finalSizeMm).toBe(10.6);
    expect(await repository.deadRankings(input.guildId)).toEqual([death]);
    await repository.recordDeathLogMessage({
      marimoId: death.id,
      diedAt: death.diedAt,
      channelId: "death-log-channel",
      messageId: "edited-death-message"
    });

    const first = await repository.prepareRevival({
      guildId: input.guildId,
      ownerUserId: input.userId,
      rescuerUserId: input.userId,
      channelId: input.channelId,
      paymentMethod: "xp",
      now: new Date("2026-08-14T03:00:00Z")
    });
    const retry = await repository.prepareRevival({
      guildId: input.guildId,
      ownerUserId: input.userId,
      rescuerUserId: input.userId,
      channelId: input.channelId,
      paymentMethod: "xp",
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
      ownerUserId: input.userId,
      rescuerUserId: input.userId,
      paymentMethod: "xp",
      costXp: 1000,
      now: new Date("2026-08-14T03:00:00Z")
    });
    expect(revived.generation).toBe(1);
    expect(revived.name).toBe("復活組のまりも");
    expect(revived.ageDays).toBe(3);
    expect(revived.sizeMm).toBe(10.6);
    expect(revived.costXp).toBe(1000);
    expect(revived.revivedAt).toEqual(new Date("2026-08-14T03:00:00Z"));
    expect(await repository.deadRankings(input.guildId)).toEqual([]);

    const pendingRevival = (await repository.pendingRevivalLogs()).find(
      (event) => event.eventId === first.eventId
    );
    expect(pendingRevival).toMatchObject({
      rescuerUserId: input.userId,
      paymentMethod: "xp",
      deliveryAttempts: 0
    });
    await repository.markRevivalLogFailed(first.eventId, "send failed");
    expect(
      (await repository.pendingRevivalLogs()).find(
        (event) => event.eventId === first.eventId
      )?.deliveryAttempts
    ).toBe(1);
    await pool.query(
      `UPDATE marimo_revivals
       SET death_log_repair_status = 'pending'
       WHERE event_id = $1`,
      [first.eventId]
    );
    const pendingRepair = (await repository.pendingDeathLogRepairs()).find(
      (repair) => repair.eventId === first.eventId
    );
    expect(pendingRepair).toMatchObject({
      marimoId: death.id,
      death,
      channelId: "death-log-channel",
      messageId: "edited-death-message",
      repairAttempts: 0
    });
    await repository.markDeathLogRepairFailed(first.eventId, "edit failed");
    expect(
      (await repository.pendingDeathLogRepairs()).find(
        (repair) => repair.eventId === first.eventId
      )?.repairAttempts
    ).toBe(1);
    await repository.markDeathLogRepaired(death.id);
    expect(
      (await repository.pendingDeathLogRepairs()).some(
        (repair) => repair.eventId === first.eventId
      )
    ).toBe(false);

    const revivalHistory = await repository.revivalLogHistory(
      input.guildId,
      new Date("2026-08-15T00:00:00Z")
    );
    expect(revivalHistory).toHaveLength(1);
    expect(revivalHistory[0]).toMatchObject({
      eventId: first.eventId,
      rescuerUserId: input.userId,
      paymentMethod: "xp"
    });

    const completedAgain = await repository.completeRevival({
      eventId: first.eventId,
      guildId: input.guildId,
      ownerUserId: input.userId,
      rescuerUserId: input.userId,
      paymentMethod: "xp",
      costXp: 1000,
      now: new Date("2026-08-15T03:00:00Z")
    });
    expect(completedAgain.id).toBe(revived.id);
    expect(completedAgain.sizeMm).toBe(10.6);
    expect(completedAgain.ageDays).toBe(3);
    expect(completedAgain.revivedAt).toEqual(revived.revivedAt);
    await repository.markRevivalLogDelivered(first.eventId);
    expect(
      (await repository.pendingRevivalLogs()).some(
        (event) => event.eventId === first.eventId
      )
    ).toBe(false);

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
      ownerUserId: input.userId,
      rescuerUserId: input.userId,
      channelId: input.channelId,
      paymentMethod: "xp",
      now: new Date("2026-08-12T03:00:00Z")
    });
    if (preparation.status !== "ready")
      throw new Error("expected revival preparation");
    await repository.cancelRevival({
      eventId: preparation.eventId,
      guildId: input.guildId,
      ownerUserId: input.userId,
      rescuerUserId: input.userId,
      paymentMethod: "xp"
    });

    const next = await repository.water({
      ...input,
      now: new Date("2026-08-12T03:00:00Z")
    });
    expect(next.status).toBe("watered");
    if (next.status !== "watered") throw new Error("expected watering");
    expect(next.watering.marimo.generation).toBe(2);
  });

  it("binds a moss-cola rescue to one helper and the exact death", async () => {
    const input = {
      guildId: "1010",
      userId: "owner-2011",
      channelId: "3010",
      displayName: "持ち主",
      baseXp: 100
    };
    await repository.water({
      ...input,
      now: new Date("2026-08-10T03:00:00Z")
    });
    const death = await repository.expireOne(
      input.guildId,
      input.userId,
      new Date("2026-08-11T15:00:00Z")
    );
    if (death === null) throw new Error("expected death");
    expect(await repository.revivableDeathKeys(input.guildId)).toEqual(
      new Set([`${death.id}:${death.diedAt.toISOString()}`])
    );

    await expect(
      repository.prepareRevival({
        guildId: input.guildId,
        ownerUserId: input.userId,
        rescuerUserId: "helper-a",
        channelId: input.channelId,
        paymentMethod: "moss-cola",
        expectedMarimoId: death.id,
        expectedDiedAt: new Date(death.diedAt.getTime() - 1),
        now: new Date("2026-08-12T03:00:00Z")
      })
    ).resolves.toEqual({ status: "stale-death" });

    const prepared = await repository.prepareRevival({
      guildId: input.guildId,
      ownerUserId: input.userId,
      rescuerUserId: "helper-a",
      channelId: input.channelId,
      paymentMethod: "moss-cola",
      expectedMarimoId: death.id,
      expectedDiedAt: death.diedAt,
      now: new Date("2026-08-12T03:00:00Z")
    });
    if (prepared.status !== "ready")
      throw new Error("expected revival preparation");

    await expect(
      repository.prepareRevival({
        guildId: input.guildId,
        ownerUserId: input.userId,
        rescuerUserId: "helper-b",
        channelId: input.channelId,
        paymentMethod: "moss-cola",
        expectedMarimoId: death.id,
        expectedDiedAt: death.diedAt,
        now: new Date("2026-08-12T03:01:00Z")
      })
    ).resolves.toEqual({ status: "in-progress" });

    const revived = await repository.completeRevival({
      eventId: prepared.eventId,
      guildId: input.guildId,
      ownerUserId: input.userId,
      rescuerUserId: "helper-a",
      paymentMethod: "moss-cola",
      costXp: 0,
      now: new Date("2026-08-12T03:02:00Z")
    });
    expect(revived).toMatchObject({
      id: death.id,
      ownerDisplayName: "持ち主",
      generation: 1,
      costXp: 0
    });
    expect(await repository.revivableDeathKeys(input.guildId)).toEqual(
      new Set()
    );
  });

  it("only advertises the latest death when no newer generation is alive", async () => {
    const input = {
      guildId: "1011",
      userId: "2012",
      channelId: "3011",
      displayName: "世代交代する客",
      baseXp: 100
    };
    await repository.water({
      ...input,
      now: new Date("2026-08-10T03:00:00Z")
    });
    const firstDeath = await repository.expireOne(
      input.guildId,
      input.userId,
      new Date("2026-08-11T15:00:00Z")
    );
    if (firstDeath === null) throw new Error("expected first death");
    expect(await repository.revivableDeathKeys(input.guildId)).toEqual(
      new Set([`${firstDeath.id}:${firstDeath.diedAt.toISOString()}`])
    );
    expect(
      await repository.latestDeathLogMessage(input.guildId, input.userId)
    ).toBeNull();
    await repository.recordDeathLogMessage({
      marimoId: firstDeath.id,
      diedAt: firstDeath.diedAt,
      channelId: "death-log-channel",
      messageId: "first-death-message"
    });
    expect(
      await repository.latestDeathLogMessage(input.guildId, input.userId)
    ).toEqual({
      channelId: "death-log-channel",
      messageId: "first-death-message"
    });

    const nextGeneration = await repository.water({
      ...input,
      now: new Date("2026-08-12T03:00:00Z")
    });
    expect(nextGeneration.status).toBe("watered");
    expect(await repository.revivableDeathKeys(input.guildId)).toEqual(
      new Set()
    );
    expect(
      await repository.latestDeathLogMessage(input.guildId, input.userId)
    ).toEqual({
      channelId: "death-log-channel",
      messageId: "first-death-message"
    });
    await expect(
      repository.prepareRevival({
        guildId: input.guildId,
        ownerUserId: input.userId,
        rescuerUserId: "helper",
        channelId: input.channelId,
        paymentMethod: "moss-cola",
        expectedMarimoId: firstDeath.id,
        expectedDiedAt: firstDeath.diedAt,
        now: new Date("2026-08-12T03:01:00Z")
      })
    ).resolves.toEqual({ status: "alive" });

    const secondDeath = await repository.expireOne(
      input.guildId,
      input.userId,
      new Date("2026-08-13T15:00:00Z")
    );
    if (secondDeath === null) throw new Error("expected second death");
    expect(secondDeath.generation).toBe(2);
    expect(
      await repository.latestDeathLogMessage(input.guildId, input.userId)
    ).toBeNull();
    await repository.recordDeathLogMessage({
      marimoId: secondDeath.id,
      diedAt: secondDeath.diedAt,
      channelId: "death-log-channel",
      messageId: "second-death-message"
    });
    expect(
      await repository.latestDeathLogMessage(input.guildId, input.userId)
    ).toEqual({
      channelId: "death-log-channel",
      messageId: "second-death-message"
    });
    expect(await repository.revivableDeathKeys(input.guildId)).toEqual(
      new Set([`${secondDeath.id}:${secondDeath.diedAt.toISOString()}`])
    );
  });
});
