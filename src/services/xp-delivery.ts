import type { Logger } from "pino";
import type { Config } from "../config/env.js";
import type { MarimoRepository } from "../db/repository.js";
import type { XpAward } from "../domain/types.js";

export type XpRepository = Pick<
  MarimoRepository,
  "pendingXp" | "markXpDelivered" | "markXpFailed"
>;

export class XpDelivery {
  public constructor(
    private readonly repository: XpRepository,
    private readonly config: Config,
    private readonly logger: Logger
  ) {}

  public get enabled(): boolean {
    return this.config.XP_WEBHOOK_URL !== undefined;
  }

  public async deliverPending(): Promise<void> {
    if (!this.enabled) return;
    const awards = await this.repository.pendingXp();
    for (const award of awards) await this.deliver(award);
  }

  private async deliver(award: XpAward): Promise<void> {
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
    }
  }
}
