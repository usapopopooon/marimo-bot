export type LivingMarimo = {
  id: string;
  guildId: string;
  userId: string;
  generation: number;
  ownerDisplayName: string;
  name: string;
  bornAt: Date;
  lastWateredAt: Date;
  lastWateredDate: string;
};

export type DeadMarimo = LivingMarimo & {
  diedAt: Date;
  finalSizeMm: number;
};

export type Watering = {
  eventId: string;
  marimo: LivingMarimo;
  wateredAt: Date;
  wateredDate: string;
  sizeMm: number;
  ageDays: number;
  awardedXp: number;
};

export type PendingWateringLog = Watering & {
  deliveryAttempts: number;
};

export type WaterResult =
  | {
      status: "already-watered";
      marimo: LivingMarimo;
      sizeMm: number;
      ageDays: number;
    }
  | { status: "watered"; watering: Watering; death?: DeadMarimo };

export type RankingEntry = LivingMarimo & {
  sizeMm: number;
  ageDays: number;
};

export type PanelKind = "water" | "size";

export type GuildConfig = {
  guildId: string;
  logChannelId: string | null;
  waterPanelChannelId: string | null;
  waterPanelMessageId: string | null;
  agePanelChannelId: string | null;
  agePanelMessageId: string | null;
  sizePanelChannelId: string | null;
  sizePanelMessageId: string | null;
};

export type XpAward = {
  eventId: string;
  guildId: string;
  userId: string;
  channelId: string;
  awardedXp: number;
  observedAt: Date;
  deliveryAttempts: number;
};
