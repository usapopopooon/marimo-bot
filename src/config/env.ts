import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/),
  DISCORD_GUILD_ID: z.string().regex(/^\d+$/).optional(),
  DATABASE_URL: z.string().url(),
  DATABASE_REQUIRE_SSL: booleanString,
  WATER_XP: z.coerce.number().int().min(1).max(1000).default(10),
  XP_WEBHOOK_URL: z.string().url().optional(),
  XP_WEBHOOK_TOKEN: z.string().min(1).optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info")
});

export type Config = z.infer<typeof schema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): Config {
  return schema.parse(environment);
}
