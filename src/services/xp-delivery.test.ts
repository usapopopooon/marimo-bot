import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config/env.js";
import type { XpAward } from "../domain/types.js";
import { XpDelivery, type XpRepository } from "./xp-delivery.js";

const award: XpAward = {
  eventId: "00000000-0000-4000-8000-000000000001",
  guildId: "1001",
  userId: "2001",
  channelId: "3001",
  awardedXp: 100,
  observedAt: new Date("2026-08-10T03:00:00Z"),
  deliveryAttempts: 0
};

function config(): Config {
  return {
    DISCORD_TOKEN: "token",
    DATABASE_URL: "postgresql://localhost/marimo",
    DATABASE_REQUIRE_SSL: false,
    WATER_XP: 100,
    XP_WEBHOOK_URL: "https://level.example.test/api/marimo",
    XP_REVIVAL_URL:
      "https://level.example.test/api/v1/integrations/marimo/revival-spends",
    XP_WEBHOOK_TOKEN: "secret",
    LOG_LEVEL: "silent"
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("XP delivery wiring", () => {
  it("passes each Discord identifier to the correct webhook field", async () => {
    const delivered: string[] = [];
    const repository: XpRepository = {
      pendingXp: vi.fn().mockResolvedValue([award]),
      markXpDelivered: vi.fn().mockImplementation((eventId: string) => {
        delivered.push(eventId);
        return Promise.resolve();
      }),
      markXpFailed: vi.fn().mockResolvedValue(undefined)
    };
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await new XpDelivery(
      repository,
      config(),
      pino({ level: "silent" })
    ).deliverPending();

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe("https://level.example.test/api/marimo");
    expect(init?.headers).toMatchObject({ authorization: "Bearer secret" });
    if (typeof init?.body !== "string")
      throw new Error("request body was not JSON text");
    expect(JSON.parse(init.body)).toEqual({
      event_id: award.eventId,
      guild_id: "1001",
      user_id: "2001",
      channel_id: "3001",
      awarded_xp: 100,
      observed_at: "2026-08-10T03:00:00.000Z"
    });
    expect(delivered).toEqual([award.eventId]);
  });

  it("does not send the same award twice when delivery runs overlap", async () => {
    const repository: XpRepository = {
      pendingXp: vi.fn().mockResolvedValue([award]),
      markXpDelivered: vi.fn().mockResolvedValue(undefined),
      markXpFailed: vi.fn().mockResolvedValue(undefined)
    };
    let finishRequest: (() => void) | undefined;
    const requestPending = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      await requestPending;
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const delivery = new XpDelivery(
      repository,
      config(),
      pino({ level: "silent" })
    );

    const first = delivery.deliverPending();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const second = delivery.deliverPending();
    finishRequest?.();
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(repository.markXpDelivered).toHaveBeenCalledOnce();
  });

  it("sends stable revival identifiers and returns the remaining XP", async () => {
    const repository: XpRepository = {
      pendingXp: vi.fn().mockResolvedValue([]),
      markXpDelivered: vi.fn().mockResolvedValue(undefined),
      markXpFailed: vi.fn().mockResolvedValue(undefined)
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        event_id: "00000000-0000-4000-8000-000000000099",
        status: "charged",
        cost_xp: 1000,
        remaining_xp: 125,
        duplicate: false
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const delivery = new XpDelivery(
      repository,
      config(),
      pino({ level: "silent" })
    );

    const result = await delivery.spendRevival({
      eventId: "00000000-0000-4000-8000-000000000099",
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      observedAt: new Date("2026-08-11T03:00:00Z")
    });

    expect(result).toEqual({
      status: "charged",
      costXp: 1000,
      remainingXp: 125,
      duplicate: false
    });
    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("fetch was not called");
    expect(call[0]).toBe(
      "https://level.example.test/api/v1/integrations/marimo/revival-spends"
    );
    if (typeof call[1]?.body !== "string")
      throw new Error("request body was not JSON text");
    expect(JSON.parse(call[1].body)).toEqual({
      event_id: "00000000-0000-4000-8000-000000000099",
      guild_id: "1001",
      user_id: "2001",
      channel_id: "3001",
      observed_at: "2026-08-11T03:00:00.000Z"
    });
  });

  it("derives the revival endpoint from the existing watering URL", () => {
    const derivedConfig = config();
    derivedConfig.XP_WEBHOOK_URL =
      "https://level.example.test/api/v1/integrations/marimo/watering-events";
    derivedConfig.XP_REVIVAL_URL = undefined;
    const delivery = new XpDelivery(
      {
        pendingXp: vi.fn().mockResolvedValue([]),
        markXpDelivered: vi.fn().mockResolvedValue(undefined),
        markXpFailed: vi.fn().mockResolvedValue(undefined)
      },
      derivedConfig,
      pino({ level: "silent" })
    );

    expect(delivery.revivalEnabled).toBe(true);
  });
});
