import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { env as processEnvironment } from "node:process";
import { fileURLToPath, URL } from "node:url";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const output = execFileSync(
  "docker",
  ["compose", "config", "--format", "json"],
  {
    cwd: projectDirectory,
    encoding: "utf8",
    env: {
      ...processEnvironment,
      DISCORD_TOKEN: "scope-discord-token",
      WATER_XP: "10",
      XP_WEBHOOK_URL: "https://example.test/watering-events",
      XP_WEBHOOK_TOKEN: "scope-webhook-token",
      LOG_LEVEL: "info"
    }
  }
);

const services = JSON.parse(output).services;
assert.equal(services.bot.environment.DISCORD_TOKEN, "scope-discord-token");
assert.equal(services.bot.environment.XP_WEBHOOK_TOKEN, "scope-webhook-token");
for (const key of [
  "DISCORD_TOKEN",
  "WATER_XP",
  "XP_WEBHOOK_URL",
  "XP_WEBHOOK_TOKEN",
  "LOG_LEVEL"
]) {
  assert.equal(services.db.environment[key], "", `${key} leaked into db`);
}
