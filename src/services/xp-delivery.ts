import type { Logger } from "pino";
import type { Config } from "../config/env.js";
import type { MarimoRepository } from "../db/repository.js";
import type { XpAward } from "../domain/types.js";

export type XpRepository = Pick<
  MarimoRepository,
  "pendingXp" | "markXpDelivered" | "markXpFailed"
>;

export type RevivalSpendResult = {
  status: "charged" | "insufficient_xp";
  costXp: number;
  remainingXp: number;
  duplicate: boolean;
};

export type RevivalItemSpendResult = {
  status: "consumed" | "insufficient_item";
  cardKey: "moss-cola";
  remainingCount: number;
  duplicate: boolean;
};

export class XpDelivery {
  private readonly inFlight = new Set<string>();

  public constructor(
    private readonly repository: XpRepository,
    private readonly config: Config,
    private readonly logger: Logger
  ) {}

  public get enabled(): boolean {
    return this.config.XP_WEBHOOK_URL !== undefined;
  }

  public get revivalEnabled(): boolean {
    return this.revivalUrl() !== undefined;
  }

  public get itemRevivalEnabled(): boolean {
    return this.itemRevivalUrl() !== undefined;
  }

  private revivalUrl(): string | undefined {
    if (this.config.XP_REVIVAL_URL !== undefined)
      return this.config.XP_REVIVAL_URL;
    if (this.config.XP_WEBHOOK_URL === undefined) return undefined;
    const url = new URL(this.config.XP_WEBHOOK_URL);
    if (!url.pathname.endsWith("/watering-events")) return undefined;
    url.pathname = url.pathname.replace(
      /\/watering-events$/,
      "/revival-spends"
    );
    return url.toString();
  }

  private itemRevivalUrl(): string | undefined {
    const revivalUrl = this.revivalUrl();
    if (revivalUrl === undefined) return undefined;
    const url = new URL(revivalUrl);
    if (!url.pathname.endsWith("/revival-spends")) return undefined;
    url.pathname = url.pathname.replace(
      /\/revival-spends$/,
      "/revival-item-spends"
    );
    return url.toString();
  }

  public async spendRevival(input: {
    eventId: string;
    guildId: string;
    userId: string;
    channelId: string;
    observedAt: Date;
  }): Promise<RevivalSpendResult> {
    const url = this.revivalUrl();
    if (url === undefined)
      throw new Error("XP revival integration is disabled");
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (this.config.XP_WEBHOOK_TOKEN !== undefined) {
      headers.authorization = `Bearer ${this.config.XP_WEBHOOK_TOKEN}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event_id: input.eventId,
        guild_id: input.guildId,
        user_id: input.userId,
        channel_id: input.channelId,
        observed_at: input.observedAt.toISOString()
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok)
      throw new Error(`XP revival API returned HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("status" in body) ||
      (body.status !== "charged" && body.status !== "insufficient_xp") ||
      !("cost_xp" in body) ||
      typeof body.cost_xp !== "number" ||
      !("remaining_xp" in body) ||
      typeof body.remaining_xp !== "number" ||
      !("duplicate" in body) ||
      typeof body.duplicate !== "boolean"
    ) {
      throw new Error("XP revival API returned an invalid response");
    }
    return {
      status: body.status,
      costXp: body.cost_xp,
      remainingXp: body.remaining_xp,
      duplicate: body.duplicate
    };
  }

  public async spendRevivalItem(input: {
    eventId: string;
    guildId: string;
    userId: string;
    channelId: string;
    observedAt: Date;
  }): Promise<RevivalItemSpendResult> {
    const url = this.itemRevivalUrl();
    if (url === undefined)
      throw new Error("Moss-cola revival integration is disabled");
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (this.config.XP_WEBHOOK_TOKEN !== undefined) {
      headers.authorization = `Bearer ${this.config.XP_WEBHOOK_TOKEN}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event_id: input.eventId,
        guild_id: input.guildId,
        user_id: input.userId,
        channel_id: input.channelId,
        card_key: "moss-cola",
        observed_at: input.observedAt.toISOString()
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok)
      throw new Error(`Moss-cola revival API returned HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("status" in body) ||
      (body.status !== "consumed" && body.status !== "insufficient_item") ||
      !("card_key" in body) ||
      body.card_key !== "moss-cola" ||
      !("remaining_count" in body) ||
      typeof body.remaining_count !== "number" ||
      !("duplicate" in body) ||
      typeof body.duplicate !== "boolean"
    ) {
      throw new Error("Moss-cola revival API returned an invalid response");
    }
    return {
      status: body.status,
      cardKey: body.card_key,
      remainingCount: body.remaining_count,
      duplicate: body.duplicate
    };
  }

  public async deliverPending(): Promise<void> {
    if (!this.enabled) return;
    const awards = await this.repository.pendingXp();
    for (const award of awards) await this.deliver(award);
  }

  private async deliver(award: XpAward): Promise<void> {
    if (this.inFlight.has(award.eventId)) return;
    this.inFlight.add(award.eventId);
    try {
      const url = this.config.XP_WEBHOOK_URL;
      if (url === undefined) return;
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };
      if (this.config.XP_WEBHOOK_TOKEN !== undefined) {
        headers.authorization = `Bearer ${this.config.XP_WEBHOOK_TOKEN}`;
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event_id: award.eventId,
          guild_id: award.guildId,
          user_id: award.userId,
          channel_id: award.channelId,
          awarded_xp: award.awardedXp,
          observed_at: award.observedAt.toISOString()
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok)
        throw new Error(`XP webhook returned HTTP ${response.status}`);
      await this.repository.markXpDelivered(award.eventId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.markXpFailed(award.eventId, message);
      this.logger.warn(
        { err: error, eventId: award.eventId },
        "XP delivery failed"
      );
    } finally {
      this.inFlight.delete(award.eventId);
    }
  }
}
