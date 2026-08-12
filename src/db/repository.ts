import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { wateringXp } from "../domain/rewards.js";
import {
  ageDays,
  deathAt,
  isDead,
  jstDate,
  revivedBornAt,
  sizeAt
} from "../domain/time.js";
import type {
  DeadMarimo,
  GuildConfig,
  LivingMarimo,
  PanelKind,
  PendingWateringLog,
  RankingEntry,
  Revival,
  RevivalPreparation,
  Watering,
  WaterResult,
  XpAward
} from "../domain/types.js";

type MarimoRow = QueryResultRow & {
  id: string;
  guild_id: string;
  user_id: string;
  generation: number;
  owner_display_name: string;
  name: string;
  born_at: Date;
  last_watered_at: Date;
  last_watered_date: string | Date;
};

type ConfigRow = QueryResultRow & {
  guild_id: string;
  log_channel_id: string | null;
  water_panel_channel_id: string | null;
  water_panel_message_id: string | null;
  age_panel_channel_id: string | null;
  age_panel_message_id: string | null;
  size_panel_channel_id: string | null;
  size_panel_message_id: string | null;
};

type WateringLogRow = MarimoRow & {
  event_id: string;
  watered_at: Date;
  watered_date: string | Date;
  size_mm: string | number;
  awarded_xp: number;
  log_delivery_attempts: number;
  is_birth: boolean;
};

type DeadMarimoRow = MarimoRow & {
  died_at: Date;
  final_size_mm: string | number;
};

type RevivalRow = DeadMarimoRow & {
  event_id: string;
  marimo_id: string;
  channel_id: string;
  cost_xp: number;
  status: "pending" | "completed";
  requested_at: Date;
  revived_at: Date | null;
};

const panelColumns: Record<PanelKind, { channel: string; message: string }> = {
  water: {
    channel: "water_panel_channel_id",
    message: "water_panel_message_id"
  },
  size: { channel: "size_panel_channel_id", message: "size_panel_message_id" }
};

function dateString(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  // PostgreSQL DATE has no timezone. node-postgres materializes it at local
  // midnight, so ISO conversion can shift it to the previous UTC date.
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function livingFromRow(row: MarimoRow): LivingMarimo {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    generation: row.generation,
    ownerDisplayName: row.owner_display_name,
    name: row.name,
    bornAt: new Date(row.born_at),
    lastWateredAt: new Date(row.last_watered_at),
    lastWateredDate: dateString(row.last_watered_date)
  };
}

function configFromRow(row: ConfigRow): GuildConfig {
  return {
    guildId: row.guild_id,
    logChannelId: row.log_channel_id,
    waterPanelChannelId: row.water_panel_channel_id,
    waterPanelMessageId: row.water_panel_message_id,
    agePanelChannelId: row.age_panel_channel_id,
    agePanelMessageId: row.age_panel_message_id,
    sizePanelChannelId: row.size_panel_channel_id,
    sizePanelMessageId: row.size_panel_message_id
  };
}

function wateringFromRow(row: WateringLogRow): Watering {
  return {
    eventId: row.event_id,
    marimo: livingFromRow(row),
    wateredAt: new Date(row.watered_at),
    wateredDate: dateString(row.watered_date),
    sizeMm: Number(row.size_mm),
    ageDays: ageDays(new Date(row.born_at), new Date(row.watered_at)),
    awardedXp: row.awarded_xp,
    isBirth: row.is_birth
  };
}

function deadFromRow(row: DeadMarimoRow): DeadMarimo {
  return {
    ...livingFromRow(row),
    diedAt: new Date(row.died_at),
    finalSizeMm: Number(row.final_size_mm)
  };
}

function firstRow<T>(rows: T[], context: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`${context} returned no row`);
  return row;
}

export class MarimoRepository {
  public constructor(private readonly pool: Pool) {}

  private async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async water(input: {
    guildId: string;
    userId: string;
    channelId: string;
    displayName: string;
    now: Date;
    baseXp: number;
  }): Promise<WaterResult> {
    return this.transaction(async (client) => {
      const lockKey = `marimo:${input.guildId}:${input.userId}`;
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [lockKey]
      );

      let active = await this.findLiving(client, input.guildId, input.userId);
      let death: DeadMarimo | undefined;
      if (active !== null && isDead(active.lastWateredDate, input.now)) {
        death = await this.kill(client, active);
        active = null;
      }

      if (
        active === null &&
        (await this.hasPendingRevival(client, input.guildId, input.userId))
      ) {
        return { status: "revival-pending" };
      }

      const today = jstDate(input.now);
      const existing = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM marimo_waterings
           WHERE guild_id = $1 AND user_id = $2 AND watered_date = $3
         ) AS exists`,
        [input.guildId, input.userId, today]
      );
      if (
        active !== null &&
        (existing.rows[0]?.exists === true || active.lastWateredDate === today)
      ) {
        return {
          status: "already-watered",
          marimo: active,
          sizeMm: sizeAt(active.bornAt, input.now),
          ageDays: ageDays(active.bornAt, input.now)
        };
      }

      const isBirth = active === null;
      if (isBirth) {
        active = await this.createGeneration(client, input);
      } else {
        const updated = await client.query<MarimoRow>(
          `UPDATE marimos
           SET owner_display_name = $3, last_watered_at = $4,
               last_watered_date = $5, updated_at = NOW()
           WHERE guild_id = $1 AND user_id = $2 AND died_at IS NULL
           RETURNING *`,
          [input.guildId, input.userId, input.displayName, input.now, today]
        );
        active = livingFromRow(firstRow(updated.rows, "marimo update"));
      }

      const eventId = randomUUID();
      const currentSize = sizeAt(active.bornAt, input.now);
      const currentAgeDays = ageDays(active.bornAt, input.now);
      const awardedXp = wateringXp(input.baseXp, currentAgeDays);
      await client.query(
        `INSERT INTO marimo_waterings (
           event_id, marimo_id, guild_id, user_id, channel_id,
           watered_date, watered_at, size_mm, awarded_xp,
           log_delivery_status, is_birth
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)`,
        [
          eventId,
          active.id,
          input.guildId,
          input.userId,
          input.channelId,
          today,
          input.now,
          currentSize,
          awardedXp,
          isBirth
        ]
      );
      await client.query(
        `INSERT INTO marimo_xp_awards (
           event_id, source_watering_event_id, award_kind,
           guild_id, user_id, channel_id, awarded_xp, observed_at
         ) VALUES ($1, $1, 'watering', $2, $3, $4, $5, $6)`,
        [
          eventId,
          input.guildId,
          input.userId,
          input.channelId,
          awardedXp,
          input.now
        ]
      );

      return {
        status: "watered",
        watering: {
          eventId,
          marimo: active,
          wateredAt: input.now,
          wateredDate: today,
          sizeMm: currentSize,
          ageDays: currentAgeDays,
          awardedXp,
          isBirth
        },
        ...(death === undefined ? {} : { death })
      };
    });
  }

  private async findLiving(
    client: PoolClient,
    guildId: string,
    userId: string
  ): Promise<LivingMarimo | null> {
    const result = await client.query<MarimoRow>(
      `SELECT * FROM marimos
       WHERE guild_id = $1 AND user_id = $2 AND died_at IS NULL
       FOR UPDATE`,
      [guildId, userId]
    );
    const row = result.rows[0];
    return row === undefined ? null : livingFromRow(row);
  }

  private async hasPendingRevival(
    client: PoolClient,
    guildId: string,
    userId: string
  ): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM marimo_revivals
         WHERE guild_id = $1 AND user_id = $2 AND status = 'pending'
       ) AS exists`,
      [guildId, userId]
    );
    return result.rows[0]?.exists === true;
  }

  private async createGeneration(
    client: PoolClient,
    input: {
      guildId: string;
      userId: string;
      displayName: string;
      now: Date;
    }
  ): Promise<LivingMarimo> {
    const generation = await client.query<{ next_generation: number }>(
      `SELECT COALESCE(MAX(generation), 0) + 1 AS next_generation
       FROM marimos WHERE guild_id = $1 AND user_id = $2`,
      [input.guildId, input.userId]
    );
    const result = await client.query<MarimoRow>(
      `INSERT INTO marimos (
         guild_id, user_id, generation, owner_display_name, name,
         born_at, last_watered_at, last_watered_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       RETURNING *`,
      [
        input.guildId,
        input.userId,
        firstRow(generation.rows, "generation query").next_generation,
        input.displayName,
        `${input.displayName}のまりも`,
        input.now,
        jstDate(input.now)
      ]
    );
    return livingFromRow(firstRow(result.rows, "generation insert"));
  }

  private async kill(
    client: PoolClient,
    marimo: LivingMarimo
  ): Promise<DeadMarimo> {
    const diedAt = deathAt(marimo.lastWateredDate);
    const finalSizeMm = sizeAt(marimo.bornAt, diedAt);
    await client.query(
      `UPDATE marimos
       SET died_at = $2, final_size_mm = $3,
           death_reason = 'water-neglect', updated_at = NOW()
       WHERE id = $1`,
      [marimo.id, diedAt, finalSizeMm]
    );
    return { ...marimo, diedAt, finalSizeMm };
  }

  public async getLiving(
    guildId: string,
    userId: string,
    now: Date
  ): Promise<RankingEntry | null> {
    const result = await this.pool.query<MarimoRow>(
      `SELECT * FROM marimos
       WHERE guild_id = $1 AND user_id = $2 AND died_at IS NULL`,
      [guildId, userId]
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    const marimo = livingFromRow(row);
    if (isDead(marimo.lastWateredDate, now)) return null;
    return {
      ...marimo,
      sizeMm: sizeAt(marimo.bornAt, now),
      ageDays: ageDays(marimo.bornAt, now)
    };
  }

  public async rename(
    guildId: string,
    userId: string,
    name: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE marimos SET name = $3, updated_at = NOW()
       WHERE guild_id = $1 AND user_id = $2 AND died_at IS NULL`,
      [guildId, userId, name]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async rankings(guildId: string, now: Date): Promise<RankingEntry[]> {
    const result = await this.pool.query<MarimoRow>(
      `SELECT * FROM marimos WHERE guild_id = $1 AND died_at IS NULL`,
      [guildId]
    );
    return result.rows
      .map(livingFromRow)
      .filter((marimo) => !isDead(marimo.lastWateredDate, now))
      .map((marimo) => ({
        ...marimo,
        sizeMm: sizeAt(marimo.bornAt, now),
        ageDays: ageDays(marimo.bornAt, now)
      }));
  }

  public async dueOwners(
    now: Date
  ): Promise<{ guildId: string; userId: string }[]> {
    const today = jstDate(now);
    const result = await this.pool.query<{ guild_id: string; user_id: string }>(
      `SELECT guild_id, user_id FROM marimos
       WHERE died_at IS NULL AND (last_watered_date + INTERVAL '2 days')::date <= $1::date`,
      [today]
    );
    return result.rows.map((row) => ({
      guildId: row.guild_id,
      userId: row.user_id
    }));
  }

  public async expireOne(
    guildId: string,
    userId: string,
    now: Date
  ): Promise<DeadMarimo | null> {
    return this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`marimo:${guildId}:${userId}`]
      );
      const active = await this.findLiving(client, guildId, userId);
      if (active === null || !isDead(active.lastWateredDate, now)) return null;
      return this.kill(client, active);
    });
  }

  public async prepareRevival(input: {
    guildId: string;
    userId: string;
    channelId: string;
    now: Date;
  }): Promise<RevivalPreparation> {
    return this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`marimo:${input.guildId}:${input.userId}`]
      );
      const active = await this.findLiving(client, input.guildId, input.userId);
      let newlyDied = false;
      if (active !== null && !isDead(active.lastWateredDate, input.now)) {
        return { status: "alive" };
      }
      if (active !== null) {
        await this.kill(client, active);
        newlyDied = true;
      }

      const deadResult = await client.query<DeadMarimoRow>(
        `SELECT * FROM marimos
         WHERE guild_id = $1 AND user_id = $2 AND died_at IS NOT NULL
         ORDER BY generation DESC
         LIMIT 1
         FOR UPDATE`,
        [input.guildId, input.userId]
      );
      const deadRow = deadResult.rows[0];
      if (deadRow === undefined) return { status: "no-dead-marimo" };
      const death = deadFromRow(deadRow);

      const pending = await client.query<RevivalRow>(
        `SELECT *, marimo_id AS id FROM marimo_revivals
         WHERE marimo_id = $1 AND status = 'pending'
         FOR UPDATE`,
        [death.id]
      );
      const existing = pending.rows[0];
      if (existing !== undefined) {
        return {
          status: "ready",
          eventId: existing.event_id,
          channelId: existing.channel_id,
          requestedAt: new Date(existing.requested_at),
          death: deadFromRow(existing),
          newlyDied
        };
      }

      const eventId = randomUUID();
      const inserted = await client.query<RevivalRow>(
        `INSERT INTO marimo_revivals (
           event_id, marimo_id, guild_id, user_id, channel_id,
           generation, owner_display_name, name, born_at,
           last_watered_at, last_watered_date, died_at, final_size_mm,
           requested_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11, $12, $13, $14
         )
         RETURNING *, marimo_id AS id`,
        [
          eventId,
          death.id,
          input.guildId,
          input.userId,
          input.channelId,
          death.generation,
          death.ownerDisplayName,
          death.name,
          death.bornAt,
          death.lastWateredAt,
          death.lastWateredDate,
          death.diedAt,
          death.finalSizeMm,
          input.now
        ]
      );
      const row = firstRow(inserted.rows, "revival insert");
      return {
        status: "ready",
        eventId: row.event_id,
        channelId: row.channel_id,
        requestedAt: new Date(row.requested_at),
        death: deadFromRow(row),
        newlyDied
      };
    });
  }

  public async cancelRevival(input: {
    eventId: string;
    guildId: string;
    userId: string;
  }): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`marimo:${input.guildId}:${input.userId}`]
      );
      await client.query(
        `DELETE FROM marimo_revivals
         WHERE event_id = $1 AND guild_id = $2 AND user_id = $3
           AND status = 'pending'`,
        [input.eventId, input.guildId, input.userId]
      );
    });
  }

  public async completeRevival(input: {
    eventId: string;
    guildId: string;
    userId: string;
    displayName: string;
    costXp: number;
    now: Date;
  }): Promise<Revival> {
    return this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`marimo:${input.guildId}:${input.userId}`]
      );
      const revivalResult = await client.query<RevivalRow>(
        `SELECT *, marimo_id AS id FROM marimo_revivals
         WHERE event_id = $1 AND guild_id = $2 AND user_id = $3
         FOR UPDATE`,
        [input.eventId, input.guildId, input.userId]
      );
      const revival = firstRow(revivalResult.rows, "revival lookup");
      if (!Number.isInteger(input.costXp) || input.costXp <= 0)
        throw new Error("revival cost must be a positive integer");
      let marimo: LivingMarimo;
      const costXp =
        revival.status === "completed" ? revival.cost_xp : input.costXp;
      if (revival.status === "completed") {
        const current = await this.findLiving(
          client,
          input.guildId,
          input.userId
        );
        if (current === null)
          throw new Error("completed revival has no living marimo");
        marimo = current;
      } else {
        const resumedBornAt = revivedBornAt(
          new Date(revival.born_at),
          new Date(revival.died_at),
          input.now
        );
        const updated = await client.query<MarimoRow>(
          `UPDATE marimos
           SET owner_display_name = $4,
               born_at = $8,
               last_watered_at = $5,
               last_watered_date = $6,
               died_at = NULL,
               final_size_mm = NULL,
               death_reason = NULL,
               updated_at = NOW()
           WHERE id = $1 AND guild_id = $2 AND user_id = $3
             AND died_at = $7
           RETURNING *`,
          [
            revival.marimo_id,
            input.guildId,
            input.userId,
            input.displayName,
            input.now,
            jstDate(input.now),
            revival.died_at,
            resumedBornAt
          ]
        );
        marimo = livingFromRow(firstRow(updated.rows, "marimo revival"));
        await client.query(
          `UPDATE marimo_revivals
           SET status = 'completed', revived_at = $2, cost_xp = $3,
               updated_at = NOW()
           WHERE event_id = $1`,
          [input.eventId, input.now, costXp]
        );
      }
      return {
        ...marimo,
        eventId: input.eventId,
        costXp,
        sizeMm: sizeAt(marimo.bornAt, input.now),
        ageDays: ageDays(marimo.bornAt, input.now)
      };
    });
  }

  public async getConfig(guildId: string): Promise<GuildConfig> {
    const result = await this.pool.query<ConfigRow>(
      "SELECT * FROM marimo_guild_configs WHERE guild_id = $1",
      [guildId]
    );
    const row = result.rows[0];
    if (row !== undefined) return configFromRow(row);
    return {
      guildId,
      logChannelId: null,
      waterPanelChannelId: null,
      waterPanelMessageId: null,
      agePanelChannelId: null,
      agePanelMessageId: null,
      sizePanelChannelId: null,
      sizePanelMessageId: null
    };
  }

  public async allowedRoleIds(guildId: string): Promise<string[]> {
    const result = await this.pool.query<{ role_id: string }>(
      `SELECT role_id FROM marimo_allowed_roles
       WHERE guild_id = $1
       ORDER BY created_at, role_id`,
      [guildId]
    );
    return result.rows.map((row) => row.role_id);
  }

  public async addAllowedRole(
    guildId: string,
    roleId: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO marimo_allowed_roles (guild_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [guildId, roleId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async removeAllowedRole(
    guildId: string,
    roleId: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM marimo_allowed_roles
       WHERE guild_id = $1 AND role_id = $2`,
      [guildId, roleId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async setLogChannel(
    guildId: string,
    channelId: string | null
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO marimo_guild_configs (guild_id, log_channel_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE
       SET log_channel_id = EXCLUDED.log_channel_id, updated_at = NOW()`,
      [guildId, channelId]
    );
  }

  public async setPanel(
    guildId: string,
    kind: PanelKind,
    channelId: string,
    messageId: string
  ): Promise<void> {
    const columns = panelColumns[kind];
    await this.pool.query(
      `INSERT INTO marimo_guild_configs (
         guild_id, ${columns.channel}, ${columns.message}
       ) VALUES ($1, $2, $3)
       ON CONFLICT (guild_id) DO UPDATE SET
         ${columns.channel} = EXCLUDED.${columns.channel},
         ${columns.message} = EXCLUDED.${columns.message},
         updated_at = NOW()`,
      [guildId, channelId, messageId]
    );
  }

  public async clearAgePanel(guildId: string): Promise<void> {
    await this.pool.query(
      `UPDATE marimo_guild_configs
       SET age_panel_channel_id = NULL, age_panel_message_id = NULL,
           updated_at = NOW()
       WHERE guild_id = $1`,
      [guildId]
    );
  }

  public async pendingWateringLogs(limit = 25): Promise<PendingWateringLog[]> {
    const result = await this.pool.query<WateringLogRow>(
      `SELECT w.event_id, w.watered_at, w.watered_date, w.size_mm, w.is_birth,
              w.awarded_xp, w.log_delivery_attempts,
              m.id, m.guild_id, m.user_id, m.generation,
              m.owner_display_name, m.name, m.born_at,
              m.last_watered_at, m.last_watered_date
       FROM marimo_waterings w
       JOIN marimos m ON m.id = w.marimo_id
       WHERE w.log_delivery_status = 'pending'
       ORDER BY w.log_delivery_attempts ASC, w.created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => ({
      ...wateringFromRow(row),
      deliveryAttempts: row.log_delivery_attempts
    }));
  }

  public async wateringLogHistory(
    guildId: string,
    through: Date
  ): Promise<Watering[]> {
    const result = await this.pool.query<WateringLogRow>(
      `SELECT w.event_id, w.watered_at, w.watered_date, w.size_mm, w.is_birth,
              w.awarded_xp, w.log_delivery_attempts,
              m.id, m.guild_id, m.user_id, m.generation,
              m.owner_display_name, m.name, m.born_at,
              m.last_watered_at, m.last_watered_date
       FROM marimo_waterings w
       JOIN marimos m ON m.id = w.marimo_id
       WHERE w.guild_id = $1 AND w.watered_at <= $2
       ORDER BY w.watered_at ASC, w.created_at ASC, w.event_id ASC`,
      [guildId, through]
    );
    return result.rows.map(wateringFromRow);
  }

  public async deathLogHistory(
    guildId: string,
    through: Date
  ): Promise<DeadMarimo[]> {
    const current = await this.pool.query<DeadMarimoRow>(
      `SELECT * FROM marimos AS marimo
       WHERE guild_id = $1 AND died_at IS NOT NULL AND died_at <= $2
         AND NOT EXISTS (
           SELECT 1 FROM marimo_revivals AS revival
           WHERE revival.marimo_id = marimo.id
             AND revival.status = 'completed'
             AND revival.died_at = marimo.died_at
         )`,
      [guildId, through]
    );
    const revived = await this.pool.query<RevivalRow>(
      `SELECT *, marimo_id AS id FROM marimo_revivals
       WHERE guild_id = $1 AND status = 'completed' AND died_at <= $2`,
      [guildId, through]
    );
    return [...current.rows, ...revived.rows]
      .map(deadFromRow)
      .sort(
        (left, right) =>
          left.diedAt.getTime() - right.diedAt.getTime() ||
          left.id.localeCompare(right.id)
      );
  }

  public async markWateringLogDelivered(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE marimo_waterings
       SET log_delivery_status = 'delivered',
           log_delivery_attempts = log_delivery_attempts + 1,
           log_delivered_at = NOW(), log_last_error = NULL
       WHERE event_id = $1`,
      [eventId]
    );
  }

  public async markWateringLogFailed(
    eventId: string,
    error: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE marimo_waterings
       SET log_delivery_attempts = log_delivery_attempts + 1,
           log_last_error = LEFT($2, 1000)
       WHERE event_id = $1`,
      [eventId, error]
    );
  }

  public async markGuildWateringLogsDeliveredThrough(
    guildId: string,
    through: Date
  ): Promise<void> {
    await this.pool.query(
      `UPDATE marimo_waterings
       SET log_delivery_status = 'delivered',
           log_delivery_attempts = log_delivery_attempts + 1,
           log_delivered_at = NOW(), log_last_error = NULL
       WHERE guild_id = $1 AND watered_at <= $2
         AND log_delivery_status = 'pending'`,
      [guildId, through]
    );
  }

  public async pendingXp(limit = 25): Promise<XpAward[]> {
    const result = await this.pool.query<
      QueryResultRow & {
        event_id: string;
        guild_id: string;
        user_id: string;
        channel_id: string;
        awarded_xp: number;
        observed_at: Date;
        delivery_attempts: number;
      }
    >(
      `SELECT * FROM marimo_xp_awards
       WHERE delivery_status = 'pending'
       ORDER BY delivery_attempts ASC, created_at ASC LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => ({
      eventId: row.event_id,
      guildId: row.guild_id,
      userId: row.user_id,
      channelId: row.channel_id,
      awardedXp: row.awarded_xp,
      observedAt: new Date(row.observed_at),
      deliveryAttempts: row.delivery_attempts
    }));
  }

  public async backfillWateringXp(targetXp: number): Promise<void> {
    const awardKind = `compensation:${targetXp}`;
    await this.pool.query(
      `INSERT INTO marimo_xp_awards (
         event_id, source_watering_event_id, award_kind,
         guild_id, user_id, channel_id, awarded_xp, observed_at
       )
       SELECT gen_random_uuid(), event_id, $2,
              guild_id, user_id, channel_id, $1 - awarded_xp, NOW()
       FROM marimo_xp_awards
       WHERE award_kind = 'watering' AND awarded_xp < $1
       ON CONFLICT (source_watering_event_id, award_kind) DO NOTHING`,
      [targetXp, awardKind]
    );
  }

  public async markXpDelivered(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE marimo_xp_awards SET delivery_status = 'delivered',
       delivery_attempts = delivery_attempts + 1, delivered_at = NOW(), last_error = NULL
       WHERE event_id = $1`,
      [eventId]
    );
  }

  public async markXpFailed(eventId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE marimo_xp_awards SET delivery_attempts = delivery_attempts + 1,
       last_error = LEFT($2, 1000) WHERE event_id = $1`,
      [eventId, error]
    );
  }
}
