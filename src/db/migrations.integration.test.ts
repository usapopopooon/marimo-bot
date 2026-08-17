import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { MarimoRepository } from "./repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("database migration upgrade", () => {
  it("adds opt-in watering reminders without enabling existing users", async () => {
    const admin = new Pool({ connectionString: databaseUrl });
    const schema = "marimo_watering_reminder_upgrade_test";
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`
    });

    try {
      for (const migration of [
        "001_initial.sql",
        "002_watering_log_delivery.sql",
        "003_xp_compensation.sql",
        "004_watering_birth.sql",
        "005_xp_delivery_fairness.sql",
        "006_calendar_day_growth.sql",
        "007_allowed_roles.sql",
        "008_marimo_revival.sql",
        "009_lower_revival_cost.sql",
        "010_watering_dialogue.sql",
        "011_dead_ranking_panel.sql"
      ]) {
        await pool.query(
          await readFile(
            resolve(process.cwd(), "migrations", migration),
            "utf8"
          )
        );
      }
      await pool.query(
        `INSERT INTO marimos (
           guild_id, user_id, generation, owner_display_name, name,
           born_at, last_watered_at, last_watered_date
         ) VALUES ('1001', '2001', 1, 'owner', 'まりも',
                   '2026-08-10T03:00:00Z', '2026-08-10T03:00:00Z', '2026-08-10')`
      );

      await pool.query(
        await readFile(
          resolve(process.cwd(), "migrations", "012_watering_reminders.sql"),
          "utf8"
        )
      );

      const repository = new MarimoRepository(pool);
      expect(
        await repository.getWateringReminderHour("1001", "2001")
      ).toBeNull();
      const preferences = await pool.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM marimo_watering_reminder_preferences"
      );
      expect(preferences.rows[0]?.count).toBe("0");

      await repository.setWateringReminderHour("1001", "2001", 18);
      expect(await repository.getWateringReminderHour("1001", "2001")).toBe(18);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("adds an independent dead ranking panel without changing existing panels", async () => {
    const admin = new Pool({ connectionString: databaseUrl });
    const schema = "marimo_dead_panel_upgrade_test";
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`
    });

    try {
      for (const migration of [
        "001_initial.sql",
        "002_watering_log_delivery.sql",
        "003_xp_compensation.sql",
        "004_watering_birth.sql",
        "005_xp_delivery_fairness.sql",
        "006_calendar_day_growth.sql",
        "007_allowed_roles.sql",
        "008_marimo_revival.sql",
        "009_lower_revival_cost.sql",
        "010_watering_dialogue.sql"
      ]) {
        await pool.query(
          await readFile(
            resolve(process.cwd(), "migrations", migration),
            "utf8"
          )
        );
      }
      await pool.query(
        `INSERT INTO marimo_guild_configs (
           guild_id, water_panel_channel_id, water_panel_message_id,
           size_panel_channel_id, size_panel_message_id
         ) VALUES ('1001', '3001', '4001', '3002', '4002')`
      );

      await pool.query(
        await readFile(
          resolve(process.cwd(), "migrations", "011_dead_ranking_panel.sql"),
          "utf8"
        )
      );

      const repository = new MarimoRepository(pool);
      expect(await repository.getConfig("1001")).toMatchObject({
        waterPanelChannelId: "3001",
        waterPanelMessageId: "4001",
        sizePanelChannelId: "3002",
        sizePanelMessageId: "4002",
        deadPanelChannelId: null,
        deadPanelMessageId: null
      });

      await repository.setPanel("1001", "dead", "3003", "4003");
      expect(await repository.getConfig("1001")).toMatchObject({
        waterPanelChannelId: "3001",
        waterPanelMessageId: "4001",
        sizePanelChannelId: "3002",
        sizePanelMessageId: "4002",
        deadPanelChannelId: "3003",
        deadPanelMessageId: "4003"
      });
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("keeps historical watering logs without retroactive dialogue", async () => {
    const admin = new Pool({ connectionString: databaseUrl });
    const schema = "marimo_dialogue_upgrade_test";
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`
    });

    try {
      for (const migration of [
        "001_initial.sql",
        "002_watering_log_delivery.sql",
        "003_xp_compensation.sql",
        "004_watering_birth.sql",
        "005_xp_delivery_fairness.sql",
        "006_calendar_day_growth.sql",
        "007_allowed_roles.sql",
        "008_marimo_revival.sql",
        "009_lower_revival_cost.sql"
      ]) {
        await pool.query(
          await readFile(
            resolve(process.cwd(), "migrations", migration),
            "utf8"
          )
        );
      }
      const marimo = await pool.query<{ id: string }>(
        `INSERT INTO marimos (
           guild_id, user_id, generation, owner_display_name, name,
           born_at, last_watered_at, last_watered_date
         ) VALUES ('1001', '2001', 1, 'owner', 'まりも',
                   '2026-08-10T03:00:00Z', '2026-08-10T03:00:00Z', '2026-08-10')
         RETURNING id`
      );
      const marimoId = marimo.rows[0]?.id;
      if (marimoId === undefined) throw new Error("expected marimo row");
      const eventId = "00000000-0000-4000-8000-000000000101";
      await pool.query(
        `INSERT INTO marimo_waterings (
           event_id, marimo_id, guild_id, user_id, channel_id,
           watered_date, watered_at, size_mm, awarded_xp, is_birth
         ) VALUES ($1, $2, '1001', '2001', '3001',
                   '2026-08-10', '2026-08-10T03:00:00Z', 10, 100, TRUE)`,
        [eventId, marimoId]
      );

      await pool.query(
        await readFile(
          resolve(process.cwd(), "migrations", "010_watering_dialogue.sql"),
          "utf8"
        )
      );

      const watering = await pool.query<{ dialogue_id: string | null }>(
        "SELECT dialogue_id FROM marimo_waterings WHERE event_id = $1",
        [eventId]
      );
      expect(watering.rows).toEqual([{ dialogue_id: null }]);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("adds one 90 XP compensation to an existing 10 XP watering", async () => {
    const admin = new Pool({ connectionString: databaseUrl });
    const schema = "marimo_migration_upgrade_test";
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`
    });

    try {
      for (const migration of [
        "001_initial.sql",
        "002_watering_log_delivery.sql"
      ]) {
        await pool.query(
          await readFile(
            resolve(process.cwd(), "migrations", migration),
            "utf8"
          )
        );
      }
      const marimo = await pool.query<{ id: string }>(
        `INSERT INTO marimos (
           guild_id, user_id, generation, owner_display_name, name,
           born_at, last_watered_at, last_watered_date
         ) VALUES ('1001', '2001', 1, 'owner', 'まりも',
                   '2026-08-10T03:00:00Z', '2026-08-10T03:00:00Z', '2026-08-10')
         RETURNING id`
      );
      const marimoId = marimo.rows[0]?.id;
      if (marimoId === undefined) throw new Error("expected marimo row");
      const eventId = "00000000-0000-4000-8000-000000000001";
      await pool.query(
        `INSERT INTO marimo_waterings (
           event_id, marimo_id, guild_id, user_id, channel_id,
           watered_date, watered_at, size_mm, awarded_xp
         ) VALUES ($1, $2, '1001', '2001', '3001',
                   '2026-08-10', '2026-08-10T03:00:00Z', 10, 10)`,
        [eventId, marimoId]
      );
      await pool.query(
        `INSERT INTO marimo_xp_awards (
           event_id, guild_id, user_id, channel_id, awarded_xp, observed_at
         ) VALUES ($1, '1001', '2001', '3001', 10, '2026-08-10T03:00:00Z')`,
        [eventId]
      );

      await pool.query(
        await readFile(
          resolve(process.cwd(), "migrations", "003_xp_compensation.sql"),
          "utf8"
        )
      );
      await pool.query(
        await readFile(
          resolve(process.cwd(), "migrations", "004_watering_birth.sql"),
          "utf8"
        )
      );
      await pool.query(
        await readFile(
          resolve(process.cwd(), "migrations", "005_xp_delivery_fairness.sql"),
          "utf8"
        )
      );
      const repository = new MarimoRepository(pool);
      await repository.backfillWateringXp(100);
      await repository.backfillWateringXp(100);

      const awards = await pool.query<{
        awarded_xp: number;
        award_kind: string;
        source_watering_event_id: string;
      }>(
        `SELECT awarded_xp, award_kind, source_watering_event_id
         FROM marimo_xp_awards ORDER BY awarded_xp`
      );
      expect(awards.rows).toEqual([
        {
          awarded_xp: 10,
          award_kind: "watering",
          source_watering_event_id: eventId
        },
        {
          awarded_xp: 90,
          award_kind: "compensation:100",
          source_watering_event_id: eventId
        }
      ]);
      const watering = await pool.query<{ is_birth: boolean }>(
        "SELECT is_birth FROM marimo_waterings WHERE event_id = $1",
        [eventId]
      );
      expect(watering.rows).toEqual([{ is_birth: true }]);
      const pendingIndex = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname = 'ix_marimo_xp_awards_pending'`
      );
      expect(pendingIndex.rows[0]?.indexdef).toContain(
        "(delivery_attempts, created_at)"
      );
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("recalculates stored sizes by Japanese calendar day", async () => {
    const admin = new Pool({ connectionString: databaseUrl });
    const schema = "marimo_calendar_growth_upgrade_test";
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`
    });

    try {
      for (const migration of [
        "001_initial.sql",
        "002_watering_log_delivery.sql",
        "003_xp_compensation.sql",
        "004_watering_birth.sql",
        "005_xp_delivery_fairness.sql"
      ]) {
        await pool.query(
          await readFile(
            resolve(process.cwd(), "migrations", migration),
            "utf8"
          )
        );
      }
      const marimo = await pool.query<{ id: string }>(
        `INSERT INTO marimos (
           guild_id, user_id, generation, owner_display_name, name,
           born_at, last_watered_at, last_watered_date,
           died_at, final_size_mm, death_reason
         ) VALUES ('1001', '2001', 1, 'owner', 'まりも',
                   '2026-08-10T14:00:00Z', '2026-08-10T15:01:00Z', '2026-08-11',
                   '2026-08-11T15:00:00Z', 10.31, 'missed-care')
         RETURNING id`
      );
      const marimoId = marimo.rows[0]?.id;
      if (marimoId === undefined) throw new Error("expected marimo row");
      await pool.query(
        `INSERT INTO marimo_waterings (
           event_id, marimo_id, guild_id, user_id, channel_id,
           watered_date, watered_at, size_mm, awarded_xp, is_birth
         ) VALUES
           ('00000000-0000-4000-8000-000000000011', $1, '1001', '2001', '3001',
            '2026-08-10', '2026-08-10T14:00:00Z', 10.00, 100, TRUE),
           ('00000000-0000-4000-8000-000000000012', $1, '1001', '2001', '3001',
            '2026-08-11', '2026-08-10T15:01:00Z', 10.01, 100, FALSE)`,
        [marimoId]
      );

      await pool.query(
        await readFile(
          resolve(process.cwd(), "migrations", "006_calendar_day_growth.sql"),
          "utf8"
        )
      );

      const waterings = await pool.query<{ size_mm: string }>(
        "SELECT size_mm FROM marimo_waterings ORDER BY watered_at"
      );
      expect(waterings.rows.map((row) => Number(row.size_mm))).toEqual([
        10, 10.3
      ]);
      const dead = await pool.query<{ final_size_mm: string }>(
        "SELECT final_size_mm FROM marimos WHERE id = $1",
        [marimoId]
      );
      expect(Number(dead.rows[0]?.final_size_mm)).toBe(10.6);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("lowers new revival costs without rewriting historical charges", async () => {
    const admin = new Pool({ connectionString: databaseUrl });
    const schema = "marimo_revival_cost_upgrade_test";
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`
    });

    try {
      for (const migration of [
        "001_initial.sql",
        "002_watering_log_delivery.sql",
        "003_xp_compensation.sql",
        "004_watering_birth.sql",
        "005_xp_delivery_fairness.sql",
        "006_calendar_day_growth.sql",
        "007_allowed_roles.sql",
        "008_marimo_revival.sql"
      ]) {
        await pool.query(
          await readFile(
            resolve(process.cwd(), "migrations", migration),
            "utf8"
          )
        );
      }
      const marimo = await pool.query<{ id: string }>(
        `INSERT INTO marimos (
           guild_id, user_id, generation, owner_display_name, name,
           born_at, last_watered_at, last_watered_date,
           died_at, final_size_mm, death_reason
         ) VALUES ('1001', '2001', 1, 'owner', 'まりも',
                   '2026-08-10T03:00:00Z', '2026-08-10T03:00:00Z', '2026-08-10',
                   '2026-08-12T15:00:00Z', 10.6, 'missed-care')
         RETURNING id`
      );
      const marimoId = marimo.rows[0]?.id;
      if (marimoId === undefined) throw new Error("expected marimo row");
      await pool.query(
        `INSERT INTO marimo_revivals (
           event_id, marimo_id, guild_id, user_id, channel_id, status,
           generation, owner_display_name, name, born_at,
           last_watered_at, last_watered_date, died_at, final_size_mm,
           requested_at
         ) VALUES (
           '00000000-0000-4000-8000-000000000091', $1,
           '1001', '2001', '3001', 'completed', 1, 'owner', 'まりも',
           '2026-08-10T03:00:00Z', '2026-08-10T03:00:00Z', '2026-08-10',
           '2026-08-12T15:00:00Z', 10.6, '2026-08-13T03:00:00Z'
         )`,
        [marimoId]
      );

      await pool.query(
        await readFile(
          resolve(process.cwd(), "migrations", "009_lower_revival_cost.sql"),
          "utf8"
        )
      );
      await pool.query(
        `INSERT INTO marimo_revivals (
           event_id, marimo_id, guild_id, user_id, channel_id,
           generation, owner_display_name, name, born_at,
           last_watered_at, last_watered_date, died_at, final_size_mm,
           requested_at
         ) VALUES (
           '00000000-0000-4000-8000-000000000092', $1,
           '1001', '2001', '3001', 1, 'owner', 'まりも',
           '2026-08-10T03:00:00Z', '2026-08-10T03:00:00Z', '2026-08-10',
           '2026-08-12T15:00:00Z', 10.6, '2026-08-13T04:00:00Z'
         )`,
        [marimoId]
      );

      const costs = await pool.query<{ cost_xp: number }>(
        "SELECT cost_xp FROM marimo_revivals ORDER BY event_id"
      );
      expect(costs.rows.map((row) => row.cost_xp)).toEqual([3000, 1000]);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
});
