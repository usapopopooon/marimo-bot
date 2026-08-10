import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

function optionalEnvironmentValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional()
  );
}

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().url(),
  DATABASE_REQUIRE_SSL: booleanString,
  WATER_XP: z.coerce.number().int().min(1).max(1000).default(10),
  XP_WEBHOOK_URL: optionalEnvironmentValue(z.string().url()),
  XP_WEBHOOK_TOKEN: optionalEnvironmentValue(z.string().min(1)),
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
