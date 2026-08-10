import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const output = execFileSync(
  "docker",
  ["compose", "config", "--no-interpolate", "--format", "json"],
  {
    cwd: projectDirectory,
    encoding: "utf8"
  }
);

const services = JSON.parse(output).services;
assert.equal(
  services.bot.environment.DISCORD_TOKEN,
  "${DISCORD_TOKEN:?set DISCORD_TOKEN}"
);
assert.equal(
  services.bot.environment.XP_WEBHOOK_TOKEN,
  "${XP_WEBHOOK_TOKEN:-}"
);
for (const key of [
  "DISCORD_TOKEN",
  "WATER_XP",
  "XP_WEBHOOK_URL",
  "XP_WEBHOOK_TOKEN",
  "LOG_LEVEL"
]) {
  assert.equal(services.db.environment[key], null, `${key} leaked into db`);
}
