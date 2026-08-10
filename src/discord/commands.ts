import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("marimo-admin")
    .setDescription("まりもBotの管理")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("panel")
        .setDescription("実行したチャンネルへ常設パネルを投稿")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("投稿するパネル")
            .setRequired(true)
            .addChoices(
              { name: "水替え", value: "water" },
              { name: "大きさランキング", value: "size" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("log")
        .setDescription("実行したチャンネルを画像ログの投稿先に設定")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("log-disable").setDescription("画像ログを停止")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("現在の設定を確認")
    )
].map((command) => command.toJSON());
