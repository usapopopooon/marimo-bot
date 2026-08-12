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
              { name: "大きさランキング", value: "size" },
              { name: "枯れたまりもランキング", value: "dead" }
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
      subcommand
        .setName("log-refresh")
        .setDescription("まりも画像ログを全履歴から時系列で作り直す")
    )
    .addSubcommandGroup((group) =>
      group
        .setName("role")
        .setDescription("まりもBotを利用できるロールを設定")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("利用できるロールを追加")
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("追加するロール")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("利用できるロールを削除")
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("削除するロール")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("list").setDescription("利用できるロールを確認")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("現在の設定を確認")
    )
].map((command) => command.toJSON());
