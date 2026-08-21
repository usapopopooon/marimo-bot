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
  isBirth: boolean;
  dialogueId: string | null;
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
  | { status: "revival-pending" }
  | { status: "watered"; watering: Watering; death?: DeadMarimo };

export type RevivalPaymentMethod = "xp" | "moss-cola";

export type RevivalPreparation =
  | { status: "alive" }
  | { status: "no-dead-marimo" }
  | { status: "stale-death" }
  | { status: "in-progress" }
  | {
      status: "ready";
      eventId: string;
      channelId: string;
      requestedAt: Date;
      death: DeadMarimo;
      newlyDied: boolean;
    };

export type Revival = RankingEntry & {
  eventId: string;
  costXp: number;
  paymentMethod: RevivalPaymentMethod;
  rescuerUserId: string;
  revivedAt: Date;
};

export type PendingRevivalLog = Revival & {
  deliveryAttempts: number;
};

export type RankingEntry = LivingMarimo & {
  sizeMm: number;
  ageDays: number;
};

export type PersonalMarimoStatus = RankingEntry & {
  dialogueId: string | null;
};

export const WATERING_REMINDER_HOURS = [8, 12, 18, 21] as const;

export type WateringReminderHour = (typeof WATERING_REMINDER_HOURS)[number];

export type DueWateringReminder = {
  guildId: string;
  userId: string;
  marimoName: string;
  logChannelId: string;
  reminderHour: WateringReminderHour;
  reminderDate: string;
};

export type PanelKind = "water" | "size" | "dead";

export type GuildConfig = {
  guildId: string;
  logChannelId: string | null;
  waterPanelChannelId: string | null;
  waterPanelMessageId: string | null;
  agePanelChannelId: string | null;
  agePanelMessageId: string | null;
  sizePanelChannelId: string | null;
  sizePanelMessageId: string | null;
  deadPanelChannelId: string | null;
  deadPanelMessageId: string | null;
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
