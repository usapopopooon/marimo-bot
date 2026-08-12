import { createHash } from "node:crypto";
import {
  AttachmentBuilder,
  Client,
  Events,
  GatewayIntentBits,
  GuildMember,
  PermissionFlagsBits,
  REST,
  Routes,
  TextChannel,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type ModalSubmitInteraction
} from "discord.js";
import type { Logger } from "pino";
import type { Config } from "../config/env.js";
import type { MarimoRepository } from "../db/repository.js";
import type {
  DeadMarimo,
  GuildConfig,
  PanelKind,
  RankingEntry,
  Revival,
  Watering
} from "../domain/types.js";
import { REVIVAL_COST_XP, wateringXp } from "../domain/rewards.js";
import { renderLivingTankImage, renderTankImage } from "../rendering/tank.js";
import type {
  RevivalSpendResult,
  XpDelivery
} from "../services/xp-delivery.js";
import { commands } from "./commands.js";
import {
  deathLogContent,
  displayMarimoName,
  isCareStreakMilestone,
  nameModal,
  NAME_BUTTON_ID,
  NAME_INPUT_ID,
  NAME_MODAL_ID,
  rankingPanel,
  REVIVE_BUTTON_ID,
  STATUS_BUTTON_ID,
  statusContent,
  WATER_BUTTON_ID,
  wateringLogContent,
  waterPanel
} from "./presentation.js";

function displayName(interaction: ButtonInteraction): string {
  return interaction.member instanceof GuildMember
    ? interaction.member.displayName
    : (interaction.user.globalName ?? interaction.user.username);
}

function panelIds(
  config: GuildConfig,
  kind: PanelKind
): [string | null, string | null] {
  if (kind === "water") {
    return [config.waterPanelChannelId, config.waterPanelMessageId];
  }
  return [config.sizePanelChannelId, config.sizePanelMessageId];
}

function configuredChannel(
  messageId: string | null,
  channelId: string | null
): string {
  return messageId === null || channelId === null
    ? "未設定"
    : `<#${channelId}>`;
}

const MARIMO_LOG_FILES = new Set(["marimo-tank.png", "marimo-memorial.png"]);

type LogPostOptions = {
  notifyOwner: boolean;
  deliveryKey?: string;
};

function logNonce(deliveryKey: string): string {
  return createHash("sha256").update(deliveryKey).digest("hex").slice(0, 25);
}

export function isMarimoImageLog(message: Message, botUserId: string): boolean {
  return (
    message.author.id === botUserId &&
    message.attachments.some((attachment) =>
      MARIMO_LOG_FILES.has(attachment.name)
    )
  );
}

type PermissionChecker = {
  has(permission: bigint): boolean;
};

const LOG_POST_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, "チャンネルを見る"],
  [PermissionFlagsBits.SendMessages, "メッセージを送信"],
  [PermissionFlagsBits.AttachFiles, "ファイルを添付"]
] as const;

const PANEL_POST_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, "チャンネルを見る"],
  [PermissionFlagsBits.SendMessages, "メッセージを送信"],
  [PermissionFlagsBits.EmbedLinks, "リンクを埋め込む"]
] as const;

export function missingLogPermissions(
  permissions: PermissionChecker | null,
  includeHistory = false
): string[] {
  const required = includeHistory
    ? [
        ...LOG_POST_PERMISSIONS,
        [
          PermissionFlagsBits.ReadMessageHistory,
          "メッセージ履歴を読む"
        ] as const
      ]
    : LOG_POST_PERMISSIONS;
  if (permissions === null) {
    return required.map(([, label]) => label);
  }
  return required
    .filter(([permission]) => !permissions.has(permission))
    .map(([, label]) => label);
}

export function missingPanelPermissions(
  permissions: PermissionChecker | null
): string[] {
  if (permissions === null) {
    return PANEL_POST_PERMISSIONS.map(([, label]) => label);
  }
  return PANEL_POST_PERMISSIONS.filter(
    ([permission]) => !permissions.has(permission)
  ).map(([, label]) => label);
}

export function hasMarimoAccess(
  allowedRoleIds: readonly string[],
  memberRoleIds: readonly string[],
  canManageGuild: boolean
): boolean {
  return (
    canManageGuild ||
    allowedRoleIds.length === 0 ||
    allowedRoleIds.some((roleId) => memberRoleIds.includes(roleId))
  );
}

function interactionRoleIds(
  interaction: ButtonInteraction | ModalSubmitInteraction
): string[] {
  const roleIds =
    interaction.member instanceof GuildMember
      ? [...interaction.member.roles.cache.keys()]
      : (interaction.member?.roles ?? []);
  if (interaction.guildId !== null && !roleIds.includes(interaction.guildId)) {
    roleIds.unshift(interaction.guildId);
  }
  return roleIds;
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error) };
  const coded = error as Error & { code?: unknown; status?: unknown };
  return {
    name: error.name,
    message: error.message,
    ...(coded.code === undefined ? {} : { code: coded.code }),
    ...(coded.status === undefined ? {} : { status: coded.status })
  };
}

export class MarimoBot {
  private readonly client = new Client({ intents: [GatewayIntentBits.Guilds] });
  private readonly wateringLogsInFlight = new Set<string>();
  private sweepTimer: NodeJS.Timeout | undefined;
  private xpTimer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly repository: MarimoRepository,
    private readonly xpDelivery: XpDelivery,
    private readonly config: Config,
    private readonly logger: Logger
  ) {}

  public async start(): Promise<void> {
    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.handleInteraction(interaction);
    });
    this.client.once(Events.ClientReady, (readyClient) => {
      this.logger.info({ user: readyClient.user.tag }, "Discord client ready");
      this.runInBackground("Client startup", () =>
        this.finishStartup(readyClient.user.id)
      );
    });
    await this.client.login(this.config.DISCORD_TOKEN);
  }

  public async stop(): Promise<void> {
    if (this.sweepTimer !== undefined) clearInterval(this.sweepTimer);
    if (this.xpTimer !== undefined) clearInterval(this.xpTimer);
    await this.client.destroy();
  }

  private async finishStartup(applicationId: string): Promise<void> {
    await this.registerCommands(applicationId);
    await this.runMaintenance();
    this.sweepTimer = setInterval(
      () =>
        this.runInBackground("Scheduled death sweep", () =>
          this.expireNeglected()
        ),
      5 * 60_000
    );
    this.xpTimer = setInterval(() => {
      this.runInBackground("Scheduled XP delivery", () =>
        this.xpDelivery.deliverPending()
      );
      this.runInBackground("Scheduled watering log delivery", () =>
        this.deliverPendingWateringLogs()
      );
    }, 60_000);
  }

  private async registerCommands(applicationId: string): Promise<void> {
    const rest = new REST().setToken(this.config.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(applicationId), {
      body: commands
    });
    this.logger.info({ scope: "global" }, "Application commands registered");
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isButton()) {
        const isMarimoPanelButton = [
          WATER_BUTTON_ID,
          STATUS_BUTTON_ID,
          NAME_BUTTON_ID,
          REVIVE_BUTTON_ID
        ].includes(interaction.customId);
        if (
          isMarimoPanelButton &&
          !(await this.ensureCurrentWaterPanel(interaction))
        )
          return;
        if (
          isMarimoPanelButton &&
          !(await this.ensureMarimoAccess(interaction))
        )
          return;
        if (interaction.customId === WATER_BUTTON_ID)
          await this.handleWater(interaction);
        if (interaction.customId === STATUS_BUTTON_ID)
          await this.handleButtonStatus(interaction);
        if (interaction.customId === NAME_BUTTON_ID)
          await this.handleNameButton(interaction);
        if (interaction.customId === REVIVE_BUTTON_ID)
          await this.handleRevive(interaction);
        return;
      }
      if (interaction.isModalSubmit()) {
        if (
          interaction.customId === NAME_MODAL_ID &&
          (await this.ensureMarimoAccess(interaction))
        )
          await this.handleNameModal(interaction);
        return;
      }
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === "marimo-admin") {
        await this.handleAdminCommand(interaction);
      }
    } catch (error) {
      this.logger.error({ error: errorDetails(error) }, "Interaction failed");
      const content =
        "処理に失敗しました。しばらくしてからもう一度お試しください。";
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction
            .editReply({ content, components: [] })
            .catch(() => undefined);
        } else {
          await interaction
            .reply({ content, ephemeral: true })
            .catch(() => undefined);
        }
      }
    }
  }

  private async ensureCurrentWaterPanel(
    interaction: ButtonInteraction
  ): Promise<boolean> {
    if (interaction.guildId === null) return true;
    const config = await this.repository.getConfig(interaction.guildId);
    const isCurrent =
      config.waterPanelChannelId === interaction.channelId &&
      config.waterPanelMessageId === interaction.message.id;
    if (!isCurrent) {
      await interaction.reply({
        content:
          "このパネルは古いため操作できません。現在の水替えパネルを使ってください。",
        ephemeral: true
      });
    }
    return isCurrent;
  }

  private async ensureMarimoAccess(
    interaction: ButtonInteraction | ModalSubmitInteraction
  ): Promise<boolean> {
    if (interaction.guildId === null) return true;
    const canManageGuild =
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ===
      true;
    if (canManageGuild) return true;
    const allowedRoleIds = await this.repository.allowedRoleIds(
      interaction.guildId
    );
    const allowed = hasMarimoAccess(
      allowedRoleIds,
      interactionRoleIds(interaction),
      false
    );
    if (!allowed) {
      await interaction.reply({
        content: [
          "まりもBotを利用するには、次のロールのいずれかが必要です。",
          allowedRoleIds.map((roleId) => `<@&${roleId}>`).join("、")
        ].join("\n"),
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }
    return allowed;
  }

  private async handleWater(interaction: ButtonInteraction): Promise<void> {
    if (interaction.guildId === null) {
      await interaction.reply({
        content: "サーバー内で利用してください。",
        ephemeral: true
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const now = new Date();
    const guildId = interaction.guildId;
    const result = await this.repository.water({
      guildId,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      displayName: displayName(interaction),
      now,
      baseXp: this.config.WATER_XP
    });
    if (result.status === "revival-pending") {
      await interaction.editReply({
        content: `復活処理が途中です。「${REVIVAL_COST_XP.toLocaleString("ja-JP")} XPで復活」をもう一度押してください。XPは二重に消費されません。`
      });
      return;
    }
    if (result.status === "already-watered") {
      await interaction.editReply({
        content: [
          "今日はもう水を替えています。",
          `**${displayMarimoName(result.marimo.name)}**｜連続飼育${result.ageDays}日｜${result.sizeMm.toFixed(2)} mm`,
          `明日は **${wateringXp(this.config.WATER_XP, result.ageDays + 1)} XP**`
        ].join("\n")
      });
      return;
    }

    const death = result.death;
    if (death !== undefined) {
      await this.runBestEffort("Death log", () => this.postDeathLog(death));
    }
    await this.runBestEffort("Watering log", () =>
      this.deliverWateringLog(result.watering)
    );
    await this.runBestEffort("Ranking update", () =>
      this.updateRankings(guildId, now)
    );
    this.runInBackground("Immediate XP delivery", () =>
      this.xpDelivery.deliverPending()
    );
    await interaction.editReply({
      content: [
        result.death === undefined
          ? result.watering.isBirth
            ? `**${displayMarimoName(result.watering.marimo.name)}** が生まれました。`
            : "水がきれいになりました。"
          : `先代は枯れてしまいました。第${result.watering.marimo.generation}世代が生まれました。`,
        `連続飼育 **${result.watering.ageDays}日**｜**${result.watering.sizeMm.toFixed(2)} mm**`,
        `本日 **+${result.watering.awardedXp} XP**｜明日は **${wateringXp(this.config.WATER_XP, result.watering.ageDays + 1)} XP**`
      ].join("\n")
    });
  }

  private async handleRevive(interaction: ButtonInteraction): Promise<void> {
    if (interaction.guildId === null) {
      await interaction.reply({
        content: "サーバー内で利用してください。",
        ephemeral: true
      });
      return;
    }
    if (!this.xpDelivery.revivalEnabled) {
      await interaction.reply({
        content: "現在、XPを使った復活は利用できません。",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const now = new Date();
    const preparation = await this.repository.prepareRevival({
      guildId,
      userId,
      channelId: interaction.channelId,
      now
    });
    if (preparation.status === "alive") {
      await interaction.editReply({ content: "まりもは元気に生きています。" });
      return;
    }
    if (preparation.status === "no-dead-marimo") {
      await interaction.editReply({
        content: "生き返らせられるまりもがいません。"
      });
      return;
    }

    if (preparation.newlyDied) {
      await this.runBestEffort("Death log before revival", () =>
        this.postDeathLog(preparation.death)
      );
      await this.runBestEffort("Ranking update before revival", () =>
        this.updateRankings(guildId, now)
      );
    }

    let spend: RevivalSpendResult;
    try {
      spend = await this.xpDelivery.spendRevival({
        eventId: preparation.eventId,
        guildId,
        userId,
        channelId: preparation.channelId,
        observedAt: preparation.requestedAt
      });
    } catch (error) {
      this.logger.warn(
        { error: errorDetails(error), eventId: preparation.eventId },
        "Revival XP request failed"
      );
      await interaction.editReply({
        content: `XPの確認が完了しませんでした。「${REVIVAL_COST_XP.toLocaleString("ja-JP")} XPで復活」をもう一度押してください。XPは二重に消費されません。`
      });
      return;
    }
    if (spend.status === "insufficient_xp") {
      await this.repository.cancelRevival({
        eventId: preparation.eventId,
        guildId,
        userId
      });
      await interaction.editReply({
        content: `復活には **${spend.costXp.toLocaleString("ja-JP")} XP** 必要です。現在は **${spend.remainingXp.toLocaleString("ja-JP")} XP** です。`
      });
      return;
    }

    let revival: Revival;
    try {
      revival = await this.repository.completeRevival({
        eventId: preparation.eventId,
        guildId,
        userId,
        displayName: displayName(interaction),
        costXp: spend.costXp,
        now: new Date()
      });
    } catch (error) {
      this.logger.error(
        { error: errorDetails(error), eventId: preparation.eventId },
        "Revival completion failed after XP charge"
      );
      await interaction.editReply({
        content:
          "XPの支払いは記録されていますが、復活の確定が途中です。もう一度押すと追加消費なしで再開します。"
      });
      return;
    }
    await this.runBestEffort("Ranking update after revival", () =>
      this.updateRankings(guildId, new Date())
    );
    await interaction.editReply({
      content: [
        `🌿 **${displayMarimoName(revival.name)}** が生き返りました。`,
        `第${revival.generation}世代｜飼育 **${revival.ageDays}日**｜**${revival.sizeMm.toFixed(2)} mm**`,
        `**-${revival.costXp.toLocaleString("ja-JP")} XP**｜残り **${spend.remainingXp.toLocaleString("ja-JP")} XP**`
      ].join("\n")
    });
  }

  private async handleButtonStatus(
    interaction: ButtonInteraction
  ): Promise<void> {
    if (interaction.guildId === null) {
      await interaction.reply({
        content: "サーバー内で利用してください。",
        ephemeral: true
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const now = new Date();
    const entry = await this.repository.getLiving(
      interaction.guildId,
      interaction.user.id,
      now
    );
    if (entry === null) {
      await interaction.editReply({
        content:
          "生きているまりもはいません。「育て始める・水を替える」から始めましょう。"
      });
      return;
    }
    const image = await renderLivingTankImage(entry);
    await interaction.editReply({
      content: statusContent(
        entry,
        this.config.WATER_XP,
        now,
        entry.dialogueId
      ),
      files: [new AttachmentBuilder(image, { name: "marimo-tank.png" })]
    });
  }

  private async handleNameButton(
    interaction: ButtonInteraction
  ): Promise<void> {
    if (interaction.guildId === null) {
      await interaction.reply({
        content: "サーバー内で利用してください。",
        ephemeral: true
      });
      return;
    }
    const entry = await this.repository.getLiving(
      interaction.guildId,
      interaction.user.id,
      new Date()
    );
    if (entry === null) {
      await interaction.reply({
        content:
          "先に「育て始める・水を替える」からまりもを育て始めてください。",
        ephemeral: true
      });
      return;
    }
    await interaction.showModal(nameModal());
  }

  private async handleNameModal(
    interaction: ModalSubmitInteraction
  ): Promise<void> {
    if (interaction.guildId === null) {
      await interaction.reply({
        content: "サーバー内で利用してください。",
        ephemeral: true
      });
      return;
    }
    const guildId = interaction.guildId;
    const now = new Date();
    const entry = await this.repository.getLiving(
      guildId,
      interaction.user.id,
      now
    );
    if (entry === null) {
      await interaction.reply({
        content:
          "生きているまりもがいません。先に「育て始める・水を替える」から始めてください。",
        ephemeral: true
      });
      return;
    }
    const name = interaction.fields.getTextInputValue(NAME_INPUT_ID).trim();
    if (name.length === 0) {
      await interaction.reply({
        content: "名前を1文字以上入力してください。",
        ephemeral: true
      });
      return;
    }
    const renamed = await this.repository.rename(
      guildId,
      interaction.user.id,
      name
    );
    if (renamed) {
      await this.runBestEffort("Ranking update after rename", () =>
        this.updateRankings(guildId, now)
      );
    }
    await interaction.reply({
      content: renamed
        ? `まりもの名前を **${displayMarimoName(name)}** に変更しました。`
        : "生きているまりもがいません。先に水替えパネルから育て始めてください。",
      ephemeral: true
    });
  }

  private async handleAdminCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (
      interaction.guildId === null ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) !==
        true
    ) {
      await interaction.reply({
        content: "サーバー管理権限が必要です。",
        ephemeral: true
      });
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    if (subcommandGroup === "role") {
      await this.handleRoleCommand(interaction, subcommand);
      return;
    }
    if (subcommand === "panel") {
      await this.postPanel(interaction);
      return;
    }
    if (subcommand === "log") {
      if (!(interaction.channel instanceof TextChannel)) {
        await interaction.reply({
          content: "テキストチャンネルで実行してください。",
          ephemeral: true
        });
        return;
      }
      const botUserId = this.client.user?.id;
      if (botUserId === undefined)
        throw new Error("Discord client is not ready");
      const missing = missingLogPermissions(
        interaction.channel.permissionsFor(botUserId)
      );
      if (missing.length > 0) {
        await interaction.reply({
          content: `このチャンネルでBotに必要な権限がありません: ${missing.join("、")}`,
          ephemeral: true
        });
        return;
      }
      await this.repository.setLogChannel(
        interaction.guildId,
        interaction.channelId
      );
      await interaction.reply({
        content: `画像ログの投稿先を <#${interaction.channelId}> に設定しました。`,
        ephemeral: true
      });
      return;
    }
    if (subcommand === "log-disable") {
      await this.repository.setLogChannel(interaction.guildId, null);
      await interaction.reply({
        content: "画像ログを停止しました。",
        ephemeral: true
      });
      return;
    }
    if (subcommand === "log-refresh") {
      await this.repostAllLogs(interaction);
      return;
    }
    const [config, allowedRoleIds] = await Promise.all([
      this.repository.getConfig(interaction.guildId),
      this.repository.allowedRoleIds(interaction.guildId)
    ]);
    await interaction.reply({
      content: [
        "# まりもBot設定",
        `水替えパネル: ${configuredChannel(config.waterPanelMessageId, config.waterPanelChannelId)}`,
        `大きさランキング: ${configuredChannel(config.sizePanelMessageId, config.sizePanelChannelId)}`,
        `画像ログ: ${config.logChannelId === null ? "未設定" : `<#${config.logChannelId}>`}`,
        `利用可能ロール: ${allowedRoleIds.length === 0 ? "未設定（全員利用可能）" : allowedRoleIds.map((roleId) => `<@&${roleId}>`).join("、")}`,
        `XP連携: ${this.xpDelivery.enabled ? "有効" : "未設定（outboxに保持）"}`
      ].join("\n"),
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }

  private async handleRoleCommand(
    interaction: ChatInputCommandInteraction,
    subcommand: string
  ): Promise<void> {
    if (interaction.guildId === null)
      throw new Error("Role command requires a guild");
    if (subcommand === "list") {
      const roleIds = await this.repository.allowedRoleIds(interaction.guildId);
      await interaction.reply({
        content:
          roleIds.length === 0
            ? "利用可能ロールは未設定です。現在は全員がまりもBotを利用できます。"
            : [
                "次のロールのいずれか、またはサーバー管理権限があれば利用できます。",
                roleIds.map((roleId) => `<@&${roleId}>`).join("、")
              ].join("\n"),
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
      return;
    }

    const role = interaction.options.getRole("role", true);
    if (subcommand === "add") {
      const added = await this.repository.addAllowedRole(
        interaction.guildId,
        role.id
      );
      await interaction.reply({
        content: added
          ? `<@&${role.id}> を利用可能ロールに追加しました。`
          : `<@&${role.id}> はすでに利用可能ロールです。`,
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
      return;
    }
    if (subcommand !== "remove")
      throw new Error(`Unknown role subcommand: ${subcommand}`);

    const removed = await this.repository.removeAllowedRole(
      interaction.guildId,
      role.id
    );
    const remaining = removed
      ? await this.repository.allowedRoleIds(interaction.guildId)
      : [];
    await interaction.reply({
      content: !removed
        ? `<@&${role.id}> は利用可能ロールに設定されていません。`
        : remaining.length === 0
          ? `<@&${role.id}> を削除しました。利用可能ロールが未設定になったため、全員が利用できます。`
          : `<@&${role.id}> を利用可能ロールから削除しました。`,
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }

  private async postPanel(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (
      !(interaction.channel instanceof TextChannel) ||
      interaction.guildId === null
    ) {
      await interaction.reply({
        content: "テキストチャンネルで実行してください。",
        ephemeral: true
      });
      return;
    }
    const botUserId = this.client.user?.id;
    if (botUserId === undefined) throw new Error("Discord client is not ready");
    const missing = missingPanelPermissions(
      interaction.channel.permissionsFor(botUserId)
    );
    if (missing.length > 0) {
      await interaction.reply({
        content: `このチャンネルでBotに必要な権限がありません: ${missing.join("、")}`,
        ephemeral: true
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const kind = interaction.options.getString("type", true) as PanelKind;
    const oldConfig = await this.repository.getConfig(interaction.guildId);
    const now = new Date();
    const entries = await this.repository.rankings(interaction.guildId, now);
    const payload =
      kind === "water"
        ? {
            ...waterPanel(this.config.WATER_XP),
            allowedMentions: { parse: [] }
          }
        : {
            ...rankingPanel(entries, now),
            allowedMentions: { parse: [] }
          };
    const message = await interaction.channel.send(payload);
    await this.repository.setPanel(
      interaction.guildId,
      kind,
      interaction.channel.id,
      message.id
    );
    await this.deactivateOldPanel(oldConfig, kind);
    await interaction.editReply({ content: "常設パネルを投稿しました。" });
  }

  private async repostAllLogs(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (
      !(interaction.channel instanceof TextChannel) ||
      interaction.guildId === null
    ) {
      await interaction.reply({
        content: "テキストチャンネルで実行してください。",
        ephemeral: true
      });
      return;
    }
    const channel = interaction.channel;
    await interaction.deferReply({ ephemeral: true });
    const startedAt = new Date();
    const botUserId = this.client.user?.id;
    if (botUserId === undefined) throw new Error("Discord client is not ready");
    const missing = missingLogPermissions(
      channel.permissionsFor(botUserId),
      true
    );
    if (missing.length > 0) {
      await interaction.editReply({
        content: `このチャンネルでBotに必要な権限がありません: ${missing.join("、")}`
      });
      return;
    }

    const oldLogs = await this.findMarimoLogs(channel, botUserId);
    const [waterings, deaths] = await Promise.all([
      this.repository.wateringLogHistory(interaction.guildId, startedAt),
      this.repository.deathLogHistory(interaction.guildId, startedAt)
    ]);
    const history = [
      ...waterings.map((watering) => ({
        at: watering.wateredAt,
        post: () =>
          this.postWateringLogToChannel(channel, watering, {
            notifyOwner: false
          })
      })),
      ...deaths.map((death) => ({
        at: death.diedAt,
        post: () =>
          this.postDeathLogToChannel(channel, death, { notifyOwner: false })
      }))
    ].sort((left, right) => left.at.getTime() - right.at.getTime());
    for (const event of history) {
      await event.post();
    }
    for (const oldLog of oldLogs) await oldLog.delete();
    await this.repository.setLogChannel(
      interaction.guildId,
      interaction.channelId
    );
    await this.repository.markGuildWateringLogsDeliveredThrough(
      interaction.guildId,
      startedAt
    );
    await interaction.deleteReply();
  }

  private async findMarimoLogs(
    channel: TextChannel,
    botUserId: string
  ): Promise<Message[]> {
    let before: string | undefined;
    const logs: Message[] = [];
    for (;;) {
      const messages = await channel.messages.fetch({
        limit: 100,
        ...(before === undefined ? {} : { before })
      });
      if (messages.size === 0) break;
      const oldest = messages.last();
      for (const message of messages.values()) {
        if (!isMarimoImageLog(message, botUserId)) continue;
        logs.push(message);
      }
      if (messages.size < 100 || oldest === undefined) break;
      before = oldest.id;
    }
    return logs;
  }

  private async deactivateOldPanel(
    config: GuildConfig,
    kind: PanelKind
  ): Promise<void> {
    const [channelId, messageId] = panelIds(config, kind);
    if (channelId === null || messageId === null) return;
    const message = await this.fetchMessage(channelId, messageId);
    if (message === null) return;
    const suffix = "\n\n-# このパネルは新しい投稿へ移動しました";
    await message
      .edit({
        content: message.content.includes(suffix)
          ? message.content
          : message.content + suffix,
        components: []
      })
      .catch((error: unknown) => {
        this.logger.warn(
          { error: errorDetails(error), channelId, messageId },
          "Old panel disable failed"
        );
      });
  }

  private async updateRankings(guildId: string, now: Date): Promise<void> {
    const [config, entries] = await Promise.all([
      this.repository.getConfig(guildId),
      this.repository.rankings(guildId, now)
    ]);
    await this.editRanking(
      config.sizePanelChannelId,
      config.sizePanelMessageId,
      entries,
      now
    );
  }

  private async refreshWaterPanels(): Promise<void> {
    await Promise.all(
      [...this.client.guilds.cache.keys()].map((guildId) =>
        this.runBestEffort("Water panel refresh", async () => {
          const config = await this.repository.getConfig(guildId);
          if (
            config.waterPanelChannelId === null ||
            config.waterPanelMessageId === null
          )
            return;
          const message = await this.fetchMessage(
            config.waterPanelChannelId,
            config.waterPanelMessageId
          );
          if (message === null) return;
          await message.edit({
            ...waterPanel(this.config.WATER_XP),
            allowedMentions: { parse: [] }
          });
        })
      )
    );
  }

  private async refreshRankingPanels(): Promise<void> {
    const now = new Date();
    await Promise.all(
      [...this.client.guilds.cache.keys()].map((guildId) =>
        this.runBestEffort("Ranking panel refresh", () =>
          this.updateRankings(guildId, now)
        )
      )
    );
  }

  private async retireAgePanels(): Promise<void> {
    await Promise.all(
      [...this.client.guilds.cache.keys()].map((guildId) =>
        this.runBestEffort("Age panel retirement", async () => {
          const config = await this.repository.getConfig(guildId);
          if (
            config.agePanelChannelId === null &&
            config.agePanelMessageId === null
          )
            return;
          if (
            config.agePanelChannelId !== null &&
            config.agePanelMessageId !== null
          ) {
            const message = await this.fetchMessage(
              config.agePanelChannelId,
              config.agePanelMessageId
            );
            if (message !== null) {
              await message.edit({
                content: [
                  "# 生存日数ランキングは終了しました",
                  "大きさランキングへ統合されました。"
                ].join("\n"),
                components: [],
                allowedMentions: { parse: [] }
              });
            }
          }
          await this.repository.clearAgePanel(guildId);
        })
      )
    );
  }

  private async editRanking(
    channelId: string | null,
    messageId: string | null,
    entries: RankingEntry[],
    now: Date
  ): Promise<void> {
    if (channelId === null || messageId === null) return;
    const message = await this.fetchMessage(channelId, messageId);
    if (message === null) return;
    await message
      .edit({
        ...rankingPanel(entries, now),
        allowedMentions: { parse: [] }
      })
      .catch((error: unknown) => {
        this.logger.warn(
          { error: errorDetails(error), channelId, messageId },
          "Ranking update failed"
        );
      });
  }

  private async fetchMessage(
    channelId: string,
    messageId: string
  ): Promise<Message | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!(channel instanceof TextChannel)) return null;
      return await channel.messages.fetch(messageId);
    } catch (error) {
      this.logger.warn(
        { error: errorDetails(error), channelId, messageId },
        "Message fetch failed"
      );
      return null;
    }
  }

  private async postWateringLog(watering: Watering): Promise<void> {
    const config = await this.repository.getConfig(watering.marimo.guildId);
    if (config.logChannelId === null) return;
    const channel = await this.client.channels.fetch(config.logChannelId);
    if (!(channel instanceof TextChannel)) {
      throw new Error("Configured watering log channel is unavailable");
    }
    await this.postWateringLogToChannel(channel, watering, {
      notifyOwner: isCareStreakMilestone(watering.ageDays),
      deliveryKey: `watering:${watering.eventId}`
    });
  }

  private async postWateringLogToChannel(
    channel: TextChannel,
    watering: Watering,
    options: LogPostOptions
  ): Promise<void> {
    const image = await renderLivingTankImage({
      ...watering.marimo,
      sizeMm: watering.sizeMm,
      ageDays: watering.ageDays
    });
    const nonce =
      options.deliveryKey === undefined
        ? undefined
        : logNonce(options.deliveryKey);
    await channel.send({
      content: wateringLogContent(watering),
      files: [new AttachmentBuilder(image, { name: "marimo-tank.png" })],
      allowedMentions: options.notifyOwner
        ? { parse: [], users: [watering.marimo.userId] }
        : { parse: [] },
      ...(nonce === undefined ? {} : { nonce, enforceNonce: true })
    });
  }

  private async deliverWateringLog(watering: Watering): Promise<void> {
    if (this.wateringLogsInFlight.has(watering.eventId)) return;
    this.wateringLogsInFlight.add(watering.eventId);
    try {
      await this.postWateringLog(watering);
      await this.repository.markWateringLogDelivered(watering.eventId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.markWateringLogFailed(watering.eventId, message);
      throw error;
    } finally {
      this.wateringLogsInFlight.delete(watering.eventId);
    }
  }

  private async deliverPendingWateringLogs(): Promise<void> {
    const waterings = await this.repository.pendingWateringLogs();
    for (const watering of waterings) {
      await this.runBestEffort("Watering log retry", () =>
        this.deliverWateringLog(watering)
      );
    }
  }

  private async postDeathLog(death: DeadMarimo): Promise<void> {
    const config = await this.repository.getConfig(death.guildId);
    if (config.logChannelId === null) return;
    const channel = await this.client.channels.fetch(config.logChannelId);
    if (!(channel instanceof TextChannel)) return;
    await this.postDeathLogToChannel(channel, death, {
      notifyOwner: true,
      deliveryKey: `death:${death.id}:${death.diedAt.toISOString()}`
    });
  }

  private async postDeathLogToChannel(
    channel: TextChannel,
    death: DeadMarimo,
    options: LogPostOptions
  ): Promise<void> {
    const image = await renderTankImage({
      seed: `${death.guildId}:${death.userId}:${death.generation}`,
      sizeMm: death.finalSizeMm,
      ageDays: Math.max(
        1,
        Math.floor(
          (death.diedAt.getTime() - death.bornAt.getTime()) / 86_400_000
        ) + 1
      ),
      dead: true
    });
    const nonce =
      options.deliveryKey === undefined
        ? undefined
        : logNonce(options.deliveryKey);
    await channel.send({
      content: deathLogContent(death),
      files: [new AttachmentBuilder(image, { name: "marimo-memorial.png" })],
      allowedMentions: options.notifyOwner
        ? { parse: [], users: [death.userId] }
        : { parse: [] },
      ...(nonce === undefined ? {} : { nonce, enforceNonce: true })
    });
  }

  private async expireNeglected(): Promise<void> {
    const now = new Date();
    const owners = await this.repository.dueOwners(now);
    const changedGuilds = new Set<string>();
    for (const owner of owners) {
      const death = await this.repository.expireOne(
        owner.guildId,
        owner.userId,
        now
      );
      if (death === null) continue;
      await this.runBestEffort("Scheduled death log", () =>
        this.postDeathLog(death)
      );
      changedGuilds.add(owner.guildId);
    }
    await Promise.allSettled(
      [...changedGuilds].map(async (guildId) =>
        this.runBestEffort("Scheduled ranking update", () =>
          this.updateRankings(guildId, now)
        )
      )
    );
  }

  private async runMaintenance(): Promise<void> {
    await this.retireAgePanels();
    await this.refreshWaterPanels();
    await this.expireNeglected();
    await this.refreshRankingPanels();
    await this.deliverPendingWateringLogs();
    await this.xpDelivery.deliverPending();
  }

  private async runBestEffort(
    operation: string,
    task: () => Promise<void>
  ): Promise<void> {
    try {
      await task();
    } catch (error) {
      this.logger.error(
        { error: errorDetails(error), operation },
        "Discord side effect failed"
      );
    }
  }

  private runInBackground(operation: string, task: () => Promise<void>): void {
    void task().catch((error: unknown) => {
      this.logger.error(
        { error: errorDetails(error), operation },
        "Background task failed"
      );
    });
  }
}
