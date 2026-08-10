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
import type { DeadMarimo, RankingEntry, Watering } from "../domain/types.js";

export const WATER_BUTTON_ID = "marimo:water";
export const STATUS_BUTTON_ID = "marimo:status";
export const NAME_BUTTON_ID = "marimo:name";
export const NAME_MODAL_ID = "marimo:name-modal";
export const NAME_INPUT_ID = "marimo:name-input";
const MARIMO_GREEN = 0x20a51f;

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
} {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(WATER_BUTTON_ID)
      .setLabel("育て始める・水を替える")
      .setEmoji("🫧")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(STATUS_BUTTON_ID)
      .setLabel("自分のまりも")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(NAME_BUTTON_ID)
      .setLabel("名前をつける")
      .setStyle(ButtonStyle.Secondary)
  );
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setColor(MARIMO_GREEN)
        .setTitle("🟢 まりもちゃん")
        .setDescription(
          [
            "まりもは時間とともに、どこまでも大きくなります。",
            `初回は自分のまりもが生まれ、**${waterXp} XP**を獲得します。`,
            `以後も1日1回水を替えると **${waterXp} XP**。丸一日忘れると枯れてしまい、次の世代へリセットされます。`
          ].join("\n")
        )
        .setFooter({ text: "日付は日本時間の0:00に切り替わります" })
    ],
    components: [row]
  };
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
): { content: string; embeds: EmbedBuilder[]; components: [] } {
  const sorted = [...entries]
    .sort((left, right) => right.sizeMm - left.sizeMm)
    .slice(0, 10);
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
    components: []
  };
}

export function statusContent(entry: RankingEntry): string {
  return [
    `# 🟢 ${displayMarimoName(entry.name)}`,
    `第${entry.generation}世代｜生後 **${entry.ageDays}日**`,
    `大きさ **${entry.sizeMm.toFixed(2)} mm**`,
    `最後の水替え **${entry.lastWateredDate}**`,
    "",
    "-# 水を替えない日が丸一日続くと枯れてしまいます"
  ].join("\n");
}

export function wateringLogContent(watering: Watering): string {
  return [
    watering.isBirth
      ? `🟢 ${ownerMention(watering.marimo.userId)} の **${displayMarimoName(watering.marimo.name)}** が生まれました`
      : `🫧 ${ownerMention(watering.marimo.userId)} が **${displayMarimoName(watering.marimo.name)}** の水を替えました`,
    `第${watering.marimo.generation}世代｜生後 **${watering.ageDays}日**｜**${watering.sizeMm.toFixed(2)} mm**｜**+${watering.awardedXp} XP**`
  ].join("\n");
}

export function deathLogContent(death: DeadMarimo): string {
  return [
    `🥀 ${ownerMention(death.userId)} の **${displayMarimoName(death.name)}** は枯れてしまいました`,
    `第${death.generation}世代｜最終サイズ **${death.finalSizeMm.toFixed(2)} mm**`
  ].join("\n");
}
