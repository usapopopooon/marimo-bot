import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  escapeMarkdown,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import type { RankingEntry, Watering } from "../domain/types.js";

export const WATER_BUTTON_ID = "marimo:water";
export const STATUS_BUTTON_ID = "marimo:status";
export const NAME_BUTTON_ID = "marimo:name";
export const NAME_MODAL_ID = "marimo:name-modal";
export const NAME_INPUT_ID = "marimo:name-input";

export function displayMarimoName(name: string): string {
  return escapeMarkdown(name);
}

export function waterPanel(waterXp: number): {
  content: string;
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
    content: [
      "# 🟢 まりもちゃん",
      "まりもは時間とともに、どこまでも大きくなります。",
      `初回は自分のまりもが生まれ、**${waterXp} XP**を獲得します。`,
      `以後も1日1回水を替えると **${waterXp} XP**。丸一日忘れると枯れてしまい、次の世代へリセットされます。`,
      "",
      "-# 日付は日本時間の0:00に切り替わります"
    ].join("\n"),
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
  return `${rank}. <@${entry.userId}>｜**${entry.sizeMm.toFixed(2)} mm（生後${entry.ageDays}日）**｜${displayMarimoName(entry.name)}`;
}

export function rankingContent(
  entries: RankingEntry[],
  updatedAt: Date
): string {
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
  return [
    "# 📏 巨大まりもランキング",
    lines.length === 0 ? "まだ生きているまりもはいません。" : lines.join("\n"),
    "",
    `-# 最終更新 <t:${Math.floor(updatedAt.getTime() / 1000)}:R>`
  ].join("\n");
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
      ? `🟢 <@${watering.marimo.userId}> の **${displayMarimoName(watering.marimo.name)}** が生まれました`
      : `🫧 <@${watering.marimo.userId}> が **${displayMarimoName(watering.marimo.name)}** の水を替えました`,
    `第${watering.marimo.generation}世代｜生後 **${watering.ageDays}日**｜**${watering.sizeMm.toFixed(2)} mm**｜**+${watering.awardedXp} XP**`
  ].join("\n");
}
