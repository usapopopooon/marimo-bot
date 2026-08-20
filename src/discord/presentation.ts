import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import {
  isCareStreakMilestone,
  marimoDialogueText
} from "../domain/dialogue.js";
import {
  DAILY_WATER_XP_INCREMENT,
  MAX_WATER_XP,
  REVIVAL_COST_XP,
  wateringXp
} from "../domain/rewards.js";
import { jstDate } from "../domain/time.js";
import {
  WATERING_REMINDER_HOURS,
  type DeadMarimo,
  type DueWateringReminder,
  type RankingEntry,
  type Watering,
  type WateringReminderHour
} from "../domain/types.js";

export const WATER_BUTTON_ID = "marimo:water";
export const STATUS_BUTTON_ID = "marimo:status";
export const NAME_BUTTON_ID = "marimo:name";
export const REVIVE_BUTTON_ID = "marimo:revive";
export const MOSS_COLA_REVIVE_BUTTON_ID = "marimo:revive:moss-cola";
export const MOSS_COLA_REVIVE_CONFIRM_BUTTON_ID =
  "marimo:revive:moss-cola:confirm";
export const MOSS_COLA_REVIVE_CANCEL_BUTTON_ID =
  "marimo:revive:moss-cola:cancel";
export const MOSS_COLA_RESCUE_BUTTON_PREFIX = "marimo:rescue:moss-cola:";
const MOSS_COLA_RESCUE_CONFIRM_BUTTON_PREFIX = "marimo:mcrc:";
export const REMINDER_BUTTON_ID = "marimo:reminder";
export const REMINDER_OFF_BUTTON_ID = "marimo:reminder:off";
export const REMINDER_HOUR_BUTTON_PREFIX = "marimo:reminder:hour:";
export const NAME_MODAL_ID = "marimo:name-modal";
export const NAME_INPUT_ID = "marimo:name-input";
const MARIMO_GREEN = 0x20a51f;
export { isCareStreakMilestone };

export function displayMarimoName(name: string): string {
  return escapeMarkdown(name);
}

function ownerMention(userId: string): string {
  return `<@${userId}>`;
}

export function waterPanel(waterXp: number): {
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  flags: [];
} {
  const maximumXp = Math.max(waterXp, MAX_WATER_XP);
  const mainRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(WATER_BUTTON_ID)
      .setLabel("育て始める・水を替える")
      .setEmoji("🫧")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(STATUS_BUTTON_ID)
      .setLabel("自分のまりもを見る")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(NAME_BUTTON_ID)
      .setLabel("名前をつける")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(REMINDER_BUTTON_ID)
      .setLabel("水換え通知")
      .setEmoji("🔔")
      .setStyle(ButtonStyle.Secondary)
  );
  const revivalRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(REVIVE_BUTTON_ID)
      .setLabel(`${REVIVAL_COST_XP.toLocaleString("ja-JP")} XPで復活`)
      .setEmoji("🌿")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(MOSS_COLA_REVIVE_BUTTON_ID)
      .setLabel("苔コーラで生き返らせる")
      .setEmoji("🫧")
      .setStyle(ButtonStyle.Success)
  );
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setColor(MARIMO_GREEN)
        .setTitle("🟢 まりもちゃん")
        .setDescription(
          [
            "🌱 **まりもを育てよう**",
            "下のボタンを押すと、自分のまりもが生まれます。",
            "まりもは時間とともに、どこまでも大きくなります。",
            "",
            "🫧 **お世話は1日1回**",
            "毎日水を替えて、まりもを育てましょう。",
            "",
            "✨ **もらえるXP**",
            `・育て始めた日：**${waterXp} XP**`,
            `・連続飼育：1日ごとに **+${DAILY_WATER_XP_INCREMENT} XP**`,
            `・最大：**${maximumXp} XP**`,
            "",
            "⚠️ **水替えを忘れると…**",
            "丸一日忘れると枯れてしまいます。",
            `枯れたまりもは **${REVIVAL_COST_XP.toLocaleString("ja-JP")} XP**で生き返らせることもできます。`,
            "**苔コーラ**は、**カフェ・コレクション**で手に入るカードです。",
            "2本以上持っていれば、コレクションに残す最初の1本を除いた重複分で復活できます。",
            `新しく育て直す場合は **${waterXp} XP**から再スタートします。`
          ].join("\n")
        )
        .setFooter({ text: "日付は日本時間の0:00に切り替わります" })
    ],
    components: [mainRow, revivalRow],
    flags: []
  };
}

export function wateringReminderSettings(hour: WateringReminderHour | null): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const current = hour === null ? "**OFF**" : `毎日 **${hour}:00（日本時間）**`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...WATERING_REMINDER_HOURS.map((candidate) =>
      new ButtonBuilder()
        .setCustomId(`${REMINDER_HOUR_BUTTON_PREFIX}${candidate}`)
        .setLabel(`${candidate}:00`)
        .setStyle(
          candidate === hour ? ButtonStyle.Success : ButtonStyle.Secondary
        )
    ),
    new ButtonBuilder()
      .setCustomId(REMINDER_OFF_BUTTON_ID)
      .setLabel("OFF")
      .setStyle(hour === null ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
  return {
    content: [
      "# 🔔 水換え通知",
      `現在: ${current}`,
      "その日にまだ水を替えていない場合だけ、まりもログで1日1回お知らせします。",
      "枯れている間は通知しません。"
    ].join("\n"),
    components: [row]
  };
}

export function wateringReminderContent(reminder: DueWateringReminder): string {
  return [
    `💧 ${ownerMention(reminder.userId)} さん、今日はまだ水換えをしていません。`,
    `**${displayMarimoName(reminder.marimoName)}** が、ぷかぷか待っています。`
  ].join("\n");
}

export function nameModal(): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(NAME_INPUT_ID)
    .setPlaceholder("新しい名前を入力")
    .setMinLength(1)
    .setMaxLength(32)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);
  const label = new LabelBuilder()
    .setLabel("まりもの名前")
    .setTextInputComponent(input);
  return new ModalBuilder()
    .setCustomId(NAME_MODAL_ID)
    .setTitle("まりもに名前をつける")
    .addLabelComponents(label);
}

function leaderboardLine(entry: RankingEntry, rank: number): string {
  return `**${rank}位**｜${ownerMention(entry.userId)}｜**${entry.sizeMm.toFixed(2)} mm**｜${displayMarimoName(entry.name)}`;
}

export function rankingPanel(
  entries: RankingEntry[],
  updatedAt: Date
): { content: string; embeds: EmbedBuilder[]; components: []; flags: [] } {
  const sorted = [...entries].sort((left, right) => right.sizeMm - left.sizeMm);
  let rank = 0;
  let previousSize: string | undefined;
  const lines = sorted.map((entry, index) => {
    const displayedSize = entry.sizeMm.toFixed(2);
    if (displayedSize !== previousSize) rank = index + 1;
    previousSize = displayedSize;
    return leaderboardLine(entry, rank);
  });
  const description = [
    lines.length === 0 ? "まだ生きているまりもはいません。" : lines.join("\n"),
    "",
    `-# 最終更新 <t:${Math.floor(updatedAt.getTime() / 1000)}:R>`
  ].join("\n");
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setColor(MARIMO_GREEN)
        .setTitle("📏 巨大まりもランキング")
        .setDescription(description)
    ],
    components: [],
    flags: []
  };
}

function deadLeaderboardLine(entry: DeadMarimo, rank: number): string {
  return `**${rank}位**｜${ownerMention(entry.userId)}｜**${entry.finalSizeMm.toFixed(2)} mm**｜第${entry.generation}世代｜${displayMarimoName(entry.name)}`;
}

export function deadRankingPanel(
  entries: DeadMarimo[],
  updatedAt: Date
): { content: string; embeds: EmbedBuilder[]; components: []; flags: [] } {
  const sorted = [...entries].sort(
    (left, right) => right.finalSizeMm - left.finalSizeMm
  );
  let rank = 0;
  let previousSize: string | undefined;
  const lines = sorted.map((entry, index) => {
    const displayedSize = entry.finalSizeMm.toFixed(2);
    if (displayedSize !== previousSize) rank = index + 1;
    previousSize = displayedSize;
    return deadLeaderboardLine(entry, rank);
  });
  const description = [
    lines.length === 0 ? "まだ枯れたまりもはいません。" : lines.join("\n"),
    "",
    `-# 最終更新 <t:${Math.floor(updatedAt.getTime() / 1000)}:R>`
  ].join("\n");
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setColor(0x766b5e)
        .setTitle("🥀 枯れたまりも大きさランキング")
        .setDescription(description)
    ],
    components: [],
    flags: []
  };
}

export function statusContent(
  entry: RankingEntry,
  baseXp: number,
  now: Date,
  dialogueId: string | null = null,
  reminderHour: WateringReminderHour | null = null
): string {
  const nextCareDay =
    entry.lastWateredDate === jstDate(now) ? entry.ageDays + 1 : entry.ageDays;
  const dialogue = marimoDialogueText(dialogueId);
  return [
    `# 🟢 ${displayMarimoName(entry.name)}`,
    `第${entry.generation}世代｜連続飼育 **${entry.ageDays}日**`,
    `大きさ **${entry.sizeMm.toFixed(2)} mm**`,
    `最後の水替え **${entry.lastWateredDate}**`,
    `次の水替え **${wateringXp(baseXp, nextCareDay)} XP**`,
    reminderHour === null
      ? "水換え通知 **OFF**"
      : `水換え通知 毎日 **${reminderHour}:00**（日本時間）`,
    ...(dialogue === null
      ? []
      : ["", `> 🟢 ${displayMarimoName(entry.name)}「${dialogue}」`]),
    "",
    "-# 水を替えない日が丸一日続くと枯れてしまいます"
  ].join("\n");
}

export function wateringLogContent(watering: Watering): string {
  const dialogue = marimoDialogueText(watering.dialogueId);
  const celebration =
    !watering.isBirth && isCareStreakMilestone(watering.ageDays)
      ? [
          "",
          `🎉 **連続飼育 ${watering.ageDays}日達成！**`,
          "おめでとうございます！"
        ]
      : [];
  return [
    watering.isBirth
      ? `🟢 ${ownerMention(watering.marimo.userId)} の **${displayMarimoName(watering.marimo.name)}** が生まれました`
      : `🫧 ${ownerMention(watering.marimo.userId)} が **${displayMarimoName(watering.marimo.name)}** の水を替えました`,
    `第${watering.marimo.generation}世代｜生後 **${watering.ageDays}日**｜**${watering.sizeMm.toFixed(2)} mm**｜**+${watering.awardedXp} XP**`,
    ...celebration,
    ...(dialogue === null
      ? []
      : ["", `> 🟢 ${displayMarimoName(watering.marimo.name)}「${dialogue}」`])
  ].join("\n");
}

export function deathLogContent(
  death: DeadMarimo,
  showRescueHelp = true
): string {
  return [
    `🥀 **${displayMarimoName(death.ownerDisplayName)}**さんの **${displayMarimoName(death.name)}** は枯れてしまいました`,
    `第${death.generation}世代｜最終サイズ **${death.finalSizeMm.toFixed(2)} mm**`,
    ...(showRescueHelp
      ? [
          "",
          "🫧 **苔コーラとは？**",
          "**カフェ・コレクション**で手に入るカードです。",
          "2本以上持っていれば、最初の1本を残し、2本目以降の重複分を1本使ってこのまりもを助けられます。"
        ]
      : [])
  ].join("\n");
}

export type MossColaRescueTarget = {
  ownerUserId: string;
  marimoId: string;
  diedAt: Date;
};

export type MossColaRescueConfirmTarget = MossColaRescueTarget & {
  sourceMessageId: string;
};

export function mossColaRescueButtonId(death: DeadMarimo): string {
  return `${MOSS_COLA_RESCUE_BUTTON_PREFIX}${death.userId}:${death.id}:${death.diedAt.getTime()}`;
}

export function mossColaRescueTarget(
  customId: string
): MossColaRescueTarget | null {
  if (!customId.startsWith(MOSS_COLA_RESCUE_BUTTON_PREFIX)) return null;
  const encoded = customId.slice(MOSS_COLA_RESCUE_BUTTON_PREFIX.length);
  const match = /^(\d+):(\d+):(\d+)$/.exec(encoded);
  if (match === null) return null;
  const [, ownerUserId, marimoId, diedAtText] = match;
  if (
    ownerUserId === undefined ||
    marimoId === undefined ||
    diedAtText === undefined
  )
    return null;
  const diedAtMs = Number(diedAtText);
  if (!Number.isSafeInteger(diedAtMs)) return null;
  const diedAt = new Date(diedAtMs);
  if (Number.isNaN(diedAt.getTime())) return null;
  return { ownerUserId, marimoId, diedAt };
}

export function mossColaRescueConfirmButtonId(
  target: MossColaRescueTarget,
  sourceMessageId: string
): string {
  return `${MOSS_COLA_RESCUE_CONFIRM_BUTTON_PREFIX}${target.ownerUserId}:${target.marimoId}:${target.diedAt.getTime()}:${sourceMessageId}`;
}

export function mossColaRescueConfirmTarget(
  customId: string
): MossColaRescueConfirmTarget | null {
  if (!customId.startsWith(MOSS_COLA_RESCUE_CONFIRM_BUTTON_PREFIX)) return null;
  const encoded = customId.slice(MOSS_COLA_RESCUE_CONFIRM_BUTTON_PREFIX.length);
  const match = /^(\d+):(\d+):(\d+):(\d+)$/.exec(encoded);
  if (match === null) return null;
  const [, ownerUserId, marimoId, diedAtText, sourceMessageId] = match;
  if (
    ownerUserId === undefined ||
    marimoId === undefined ||
    diedAtText === undefined ||
    sourceMessageId === undefined
  )
    return null;
  const diedAtMs = Number(diedAtText);
  if (!Number.isSafeInteger(diedAtMs)) return null;
  const diedAt = new Date(diedAtMs);
  if (Number.isNaN(diedAt.getTime())) return null;
  return { ownerUserId, marimoId, diedAt, sourceMessageId };
}

export function mossColaRevivalConfirmation(
  confirmButtonId: string,
  isRescue: boolean
): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  return {
    content: [
      `**カフェ・コレクション**のカード「苔コーラ」を1本使って、${isRescue ? "このまりもを助けますか？" : "まりもを復活させますか？"}`,
      "最初の1本はコレクションに残り、2本目以降の重複分を1本消費します。"
    ].join("\n"),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(confirmButtonId)
          .setLabel(isRescue ? "苔コーラを与える" : "復活させる")
          .setEmoji("🫧")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(MOSS_COLA_REVIVE_CANCEL_BUTTON_ID)
          .setLabel("やめる")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

export function deathLogComponents(
  death: DeadMarimo
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(mossColaRescueButtonId(death))
        .setLabel("苔コーラを与える")
        .setEmoji("🫧")
        .setStyle(ButtonStyle.Success)
    )
  ];
}
