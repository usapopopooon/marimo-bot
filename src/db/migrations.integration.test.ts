import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { MarimoRepository } from "./repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("database migration upgrade", () => {
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
});
