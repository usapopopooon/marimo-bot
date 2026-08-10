import { describe, expect, it } from "vitest";
import { loadConfig } from "./env.js";

const required = {
  DISCORD_TOKEN: "discord-token",
  DATABASE_URL: "postgresql://marimo:secret@postgres:5432/marimo_bot"
};

describe("environment config", () => {
  it("accepts Coolify empty optional variables", () => {
    const config = loadConfig({
      ...required,
      XP_WEBHOOK_URL: "",
      XP_WEBHOOK_TOKEN: ""
    });

    expect(config.XP_WEBHOOK_URL).toBeUndefined();
    expect(config.XP_WEBHOOK_TOKEN).toBeUndefined();
    expect(config.WATER_XP).toBe(10);
  });

  it("keeps configured XP integration values", () => {
    const config = loadConfig({
      ...required,
      XP_WEBHOOK_URL:
        "https://level.example.test/api/v1/integrations/marimo/watering-events",
      XP_WEBHOOK_TOKEN: "shared-secret",
      WATER_XP: "10"
    });

    expect(config.XP_WEBHOOK_TOKEN).toBe("shared-secret");
    expect(config.WATER_XP).toBe(10);
  });
});
