import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import type { RankingEntry } from "../domain/types.js";

export const WATER_BUTTON_ID = "marimo:water";
export const STATUS_BUTTON_ID = "marimo:status";
export const NAME_BUTTON_ID = "marimo:name";
export const NAME_MODAL_ID = "marimo:name-modal";
export const NAME_INPUT_ID = "marimo:name-input";

export function waterPanel(waterXp: number): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(WATER_BUTTON_ID)
      .setLabel("水を替える")
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
      `1日1回水を替えると **${waterXp} XP**。丸一日忘れると枯れてしまい、次の世代へリセットされます。`,
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

function leaderboardLine(
  entry: RankingEntry,
  index: number,
  kind: "age" | "size"
): string {
  const value =
    kind === "age" ? `${entry.ageDays}日` : `${entry.sizeMm.toFixed(2)} mm`;
  return `${index + 1}. <@${entry.userId}>｜**${value}**｜${entry.name}`;
}

export function rankingContent(
  entries: RankingEntry[],
  kind: "age" | "size",
  updatedAt: Date
): string {
  const sorted = [...entries]
    .sort((left, right) =>
      kind === "age" ? right.ageDays - left.ageDays : right.sizeMm - left.sizeMm
    )
    .slice(0, 10);
  const title =
    kind === "age" ? "🏆 ご長寿まりもランキング" : "📏 巨大まりもランキング";
  const lines = sorted.map((entry, index) =>
    leaderboardLine(entry, index, kind)
  );
  return [
    `# ${title}`,
    lines.length === 0 ? "まだ生きているまりもはいません。" : lines.join("\n"),
    "",
    `-# 最終更新 <t:${Math.floor(updatedAt.getTime() / 1000)}:R>`
  ].join("\n");
}

export function statusContent(entry: RankingEntry): string {
  return [
    `# 🟢 ${entry.name}`,
    `第${entry.generation}世代｜生後 **${entry.ageDays}日**`,
    `大きさ **${entry.sizeMm.toFixed(2)} mm**`,
    `最後の水替え **${entry.lastWateredDate}**`,
    "",
    "-# 水を替えない日が丸一日続くと枯れてしまいます"
  ].join("\n");
}
