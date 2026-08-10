import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";

export async function runMigrations(
  pool: Pool,
  directory = resolve(process.cwd(), "migrations")
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('marimo-migrations'))"
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS marimo_schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const files = (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files) {
      const applied = await client.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM marimo_schema_migrations WHERE name = $1) AS exists",
        [name]
      );
      if (applied.rows[0]?.exists === true) continue;
      const sql = await readFile(resolve(directory, name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO marimo_schema_migrations (name) VALUES ($1)",
          [name]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext('marimo-migrations'))"
    );
    client.release();
  }
}
