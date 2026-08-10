import { Pool } from "pg";
import pino from "pino";
import { loadConfig } from "../config/env.js";
import { runMigrations } from "../db/migrate.js";
import { MarimoRepository } from "../db/repository.js";
import { MarimoBot } from "../discord/bot.js";
import { XpDelivery } from "../services/xp-delivery.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ...(config.DATABASE_REQUIRE_SSL ? { ssl: { rejectUnauthorized: false } } : {})
});

await runMigrations(pool);
const repository = new MarimoRepository(pool);
const xpDelivery = new XpDelivery(repository, config, logger);
const bot = new MarimoBot(repository, xpDelivery, config, logger);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  await bot.stop();
  await pool.end();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await bot.start();
