import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { ageDays, deathAt, isDead, jstDate, sizeAt } from "../domain/time.js";
import type {
  DeadMarimo,
  GuildConfig,
  LivingMarimo,
  PanelKind,
  RankingEntry,
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

const panelColumns: Record<PanelKind, { channel: string; message: string }> = {
  water: {
    channel: "water_panel_channel_id",
    message: "water_panel_message_id"
  },
  age: { channel: "age_panel_channel_id", message: "age_panel_message_id" },
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
    awardedXp: number;
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

      const today = jstDate(input.now);
      const existing = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM marimo_waterings
           WHERE guild_id = $1 AND user_id = $2 AND watered_date = $3
         ) AS exists`,
        [input.guildId, input.userId, today]
      );
      if (existing.rows[0]?.exists === true && active !== null) {
        return {
          status: "already-watered",
          marimo: active,
          sizeMm: sizeAt(active.bornAt, input.now),
          ageDays: ageDays(active.bornAt, input.now)
        };
      }

      if (active === null) {
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
      await client.query(
        `INSERT INTO marimo_waterings (
           event_id, marimo_id, guild_id, user_id, channel_id,
           watered_date, watered_at, size_mm, awarded_xp
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          eventId,
          active.id,
          input.guildId,
          input.userId,
          input.channelId,
          today,
          input.now,
          currentSize,
          input.awardedXp
        ]
      );
      await client.query(
        `INSERT INTO marimo_xp_awards (
           event_id, guild_id, user_id, channel_id, awarded_xp, observed_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          eventId,
          input.guildId,
          input.userId,
          input.channelId,
          input.awardedXp,
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
          ageDays: ageDays(active.bornAt, input.now),
          awardedXp: input.awardedXp
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
       ORDER BY created_at ASC LIMIT $1`,
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
