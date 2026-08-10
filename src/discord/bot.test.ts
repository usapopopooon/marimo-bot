import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import {
  PermissionFlagsBits,
  PermissionsBitField,
  TextChannel,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type ModalBuilder
} from "discord.js";
import type { Config } from "../config/env.js";
import type { MarimoRepository } from "../db/repository.js";
import type { GuildConfig, RankingEntry, Watering } from "../domain/types.js";
import type { XpDelivery } from "../services/xp-delivery.js";
import { isMarimoImageLog, MarimoBot, missingLogPermissions } from "./bot.js";
import { NAME_BUTTON_ID, NAME_MODAL_ID } from "./presentation.js";

const config: Config = {
  DISCORD_TOKEN: "token",
  DATABASE_URL: "postgresql://localhost/marimo",
  DATABASE_REQUIRE_SSL: false,
  WATER_XP: 100,
  XP_WEBHOOK_URL: undefined,
  XP_WEBHOOK_TOKEN: undefined,
  LOG_LEVEL: "silent"
};

const guildConfig: GuildConfig = {
  guildId: "1001",
  logChannelId: null,
  waterPanelChannelId: null,
  waterPanelMessageId: null,
  agePanelChannelId: null,
  agePanelMessageId: null,
  sizePanelChannelId: null,
  sizePanelMessageId: null
};

const living: RankingEntry = {
  id: "1",
  guildId: "1001",
  userId: "2001",
  generation: 1,
  ownerDisplayName: "owner",
  name: "まりも",
  bornAt: new Date("2026-08-10T00:00:00Z"),
  lastWateredAt: new Date("2026-08-10T00:00:00Z"),
  lastWateredDate: "2026-08-10",
  sizeMm: 10,
  ageDays: 1
};

const watering: Watering = {
  eventId: "00000000-0000-4000-8000-000000000001",
  marimo: living,
  wateredAt: new Date("2026-08-10T00:00:00Z"),
  wateredDate: "2026-08-10",
  sizeMm: 10,
  ageDays: 1,
  awardedXp: 100
};

type InteractionDispatcher = {
  handleInteraction(interaction: Interaction): Promise<void>;
};

type RankingUpdater = {
  updateRankings(guildId: string, now: Date): Promise<void>;
  editRanking(
    channelId: string | null,
    messageId: string | null,
    entries: RankingEntry[],
    now: Date
  ): Promise<void>;
};

type WateringLogDeliverer = {
  deliverWateringLog(watering: Watering): Promise<void>;
  deliverPendingWateringLogs(): Promise<void>;
  postWateringLog(watering: Watering): Promise<void>;
};

type LogRefresher = {
  client: { user: { id: string } | null };
  repostAllLogs(interaction: ChatInputCommandInteraction): Promise<void>;
  findMarimoLogs(channel: TextChannel, botUserId: string): Promise<Message[]>;
  postCurrentMarimoLog(
    channel: TextChannel,
    entry: RankingEntry
  ): Promise<void>;
};

type ClientAccessor = {
  client: { user: { id: string } | null };
};

function botWith(repository: Partial<MarimoRepository>): MarimoBot {
  return new MarimoBot(
    repository as MarimoRepository,
    {} as XpDelivery,
    config,
    pino({ level: "silent" })
  );
}

async function dispatch(bot: MarimoBot, interaction: object): Promise<void> {
  await (bot as unknown as InteractionDispatcher).handleInteraction(
    interaction as Interaction
  );
}

function logMessage(authorId: string, attachmentName: string): Message {
  return {
    author: { id: authorId },
    attachments: {
      some: (predicate: (attachment: { name: string }) => boolean) =>
        predicate({ name: attachmentName })
    }
  } as unknown as Message;
}

function logChannel(
  flags: bigint[] = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory
  ]
): TextChannel {
  const channel = Object.create(TextChannel.prototype) as TextChannel;
  Object.defineProperty(channel, "permissionsFor", {
    value: () => new PermissionsBitField(flags)
  });
  return channel;
}

describe("panel interaction wiring", () => {
  it("recognizes only this bot's marimo image logs for deletion", () => {
    expect(isMarimoImageLog(logMessage("bot", "marimo-tank.png"), "bot")).toBe(
      true
    );
    expect(
      isMarimoImageLog(logMessage("bot", "marimo-memorial.png"), "bot")
    ).toBe(true);
    expect(isMarimoImageLog(logMessage("user", "marimo-tank.png"), "bot")).toBe(
      false
    );
    expect(isMarimoImageLog(logMessage("bot", "other.png"), "bot")).toBe(false);
  });

  it("reports the exact missing image log permissions", () => {
    const permissions = new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages
    ]);

    expect(missingLogPermissions(permissions)).toEqual(["ファイルを添付"]);
    expect(missingLogPermissions(permissions, true)).toEqual([
      "ファイルを添付",
      "メッセージ履歴を読む"
    ]);
  });

  it("opens the naming modal from the panel button", async () => {
    const showModal = vi
      .fn<(modal: ModalBuilder) => Promise<void>>()
      .mockResolvedValue(undefined);
    await dispatch(botWith({}), {
      isButton: () => true,
      customId: NAME_BUTTON_ID,
      showModal
    });

    expect(showModal).toHaveBeenCalledOnce();
    expect(showModal.mock.calls[0]?.[0].toJSON()).toMatchObject({
      custom_id: NAME_MODAL_ID
    });
  });

  it("updates only the combined size leaderboard", async () => {
    const configured = {
      ...guildConfig,
      agePanelChannelId: "old-age-channel",
      agePanelMessageId: "old-age-message",
      sizePanelChannelId: "size-channel",
      sizePanelMessageId: "size-message"
    };
    const repository: Partial<MarimoRepository> = {
      getConfig: vi.fn().mockResolvedValue(configured),
      rankings: vi.fn().mockResolvedValue([living])
    };
    const bot = botWith(repository) as unknown as RankingUpdater;
    const editRanking = vi.fn().mockResolvedValue(undefined);
    bot.editRanking = editRanking;
    const now = new Date("2026-08-10T00:00:00Z");

    await bot.updateRankings("1001", now);

    expect(editRanking).toHaveBeenCalledOnce();
    expect(editRanking).toHaveBeenCalledWith(
      "size-channel",
      "size-message",
      [living],
      now
    );
  });

  it("uses the command channel as the image log channel", async () => {
    const setLogChannel = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue(undefined);

    const bot = botWith({ setLogChannel });
    const client = (bot as unknown as ClientAccessor).client;
    Object.defineProperty(client, "user", { value: { id: "bot" } });
    await dispatch(bot, {
      isButton: () => false,
      isModalSubmit: () => false,
      isChatInputCommand: () => true,
      commandName: "marimo-admin",
      guildId: "1001",
      channelId: "3001",
      channel: logChannel(),
      memberPermissions: { has: () => true },
      options: { getSubcommand: () => "log" },
      reply
    });

    expect(setLogChannel).toHaveBeenCalledWith("1001", "3001");
    expect(reply).toHaveBeenCalledWith({
      content: "画像ログの投稿先を <#3001> に設定しました。",
      ephemeral: true
    });
  });

  it("retries an uncertain watering log post from the pending queue", async () => {
    const markWateringLogDelivered = vi.fn().mockResolvedValue(undefined);
    const markWateringLogFailed = vi.fn().mockResolvedValue(undefined);
    const repository: Partial<MarimoRepository> = {
      pendingWateringLogs: vi.fn().mockResolvedValue([watering]),
      markWateringLogDelivered,
      markWateringLogFailed
    };
    const bot = botWith(repository) as unknown as WateringLogDeliverer;
    const postWateringLog = vi
      .fn()
      .mockRejectedValueOnce(new Error("unknown Discord result"))
      .mockResolvedValueOnce(undefined);
    bot.postWateringLog = postWateringLog;

    await expect(bot.deliverWateringLog(watering)).rejects.toThrow(
      "unknown Discord result"
    );
    await bot.deliverPendingWateringLogs();

    expect(postWateringLog).toHaveBeenCalledTimes(2);
    expect(markWateringLogFailed).toHaveBeenCalledWith(
      watering.eventId,
      "unknown Discord result"
    );
    expect(markWateringLogDelivered).toHaveBeenCalledWith(watering.eventId);
  });

  it("refreshes all current logs without a completion announcement", async () => {
    const repository: Partial<MarimoRepository> = {
      setLogChannel: vi.fn().mockResolvedValue(undefined),
      rankings: vi.fn().mockResolvedValue([living]),
      markGuildWateringLogsDeliveredThrough: vi
        .fn()
        .mockResolvedValue(undefined)
    };
    const bot = botWith(repository) as unknown as LogRefresher;
    Object.defineProperty(bot.client, "user", { value: { id: "bot" } });
    const deleteOldLog = vi.fn().mockResolvedValue(undefined);
    const oldLog = { delete: deleteOldLog } as unknown as Message;
    const findMarimoLogs = vi.fn().mockResolvedValue([oldLog]);
    const postCurrentMarimoLog = vi.fn().mockResolvedValue(undefined);
    bot.findMarimoLogs = findMarimoLogs;
    bot.postCurrentMarimoLog = postCurrentMarimoLog;
    const channel = logChannel();
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const deleteReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);

    await bot.repostAllLogs({
      guildId: "1001",
      channelId: "3001",
      channel,
      deferReply,
      deleteReply,
      editReply
    } as unknown as ChatInputCommandInteraction);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(findMarimoLogs).toHaveBeenCalledWith(channel, "bot");
    expect(postCurrentMarimoLog).toHaveBeenCalledWith(channel, living);
    expect(postCurrentMarimoLog.mock.invocationCallOrder[0]).toBeLessThan(
      deleteOldLog.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(deleteOldLog).toHaveBeenCalledOnce();
    expect(deleteReply).toHaveBeenCalledOnce();
    expect(editReply).not.toHaveBeenCalled();
  });

  it("does not change or delete logs when image permissions are missing", async () => {
    const setLogChannel = vi.fn().mockResolvedValue(undefined);
    const repository: Partial<MarimoRepository> = { setLogChannel };
    const bot = botWith(repository) as unknown as LogRefresher;
    Object.defineProperty(bot.client, "user", { value: { id: "bot" } });
    const findMarimoLogs = vi.fn().mockResolvedValue([]);
    const postCurrentMarimoLog = vi.fn().mockResolvedValue(undefined);
    bot.findMarimoLogs = findMarimoLogs;
    bot.postCurrentMarimoLog = postCurrentMarimoLog;
    const editReply = vi.fn().mockResolvedValue(undefined);

    await bot.repostAllLogs({
      guildId: "1001",
      channelId: "3001",
      channel: logChannel([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply
    } as unknown as ChatInputCommandInteraction);

    expect(editReply).toHaveBeenCalledWith({
      content: "このチャンネルでBotに必要な権限がありません: ファイルを添付"
    });
    expect(findMarimoLogs).not.toHaveBeenCalled();
    expect(postCurrentMarimoLog).not.toHaveBeenCalled();
    expect(setLogChannel).not.toHaveBeenCalled();
  });

  it("keeps every old log when a replacement post fails", async () => {
    const setLogChannel = vi.fn().mockResolvedValue(undefined);
    const repository: Partial<MarimoRepository> = {
      setLogChannel,
      rankings: vi.fn().mockResolvedValue([living])
    };
    const bot = botWith(repository) as unknown as LogRefresher;
    Object.defineProperty(bot.client, "user", { value: { id: "bot" } });
    const deleteOldLog = vi.fn().mockResolvedValue(undefined);
    bot.findMarimoLogs = vi.fn().mockResolvedValue([{ delete: deleteOldLog }]);
    bot.postCurrentMarimoLog = vi
      .fn()
      .mockRejectedValue(new Error("Discord send failed"));

    await expect(
      bot.repostAllLogs({
        guildId: "1001",
        channelId: "3001",
        channel: logChannel(),
        deferReply: vi.fn().mockResolvedValue(undefined)
      } as unknown as ChatInputCommandInteraction)
    ).rejects.toThrow("Discord send failed");

    expect(deleteOldLog).not.toHaveBeenCalled();
    expect(setLogChannel).not.toHaveBeenCalled();
  });

  it("passes modal guild, user, and trimmed name to rename", async () => {
    const rename = vi.fn().mockResolvedValue(true);
    const reply = vi.fn().mockResolvedValue(undefined);
    const repository: Partial<MarimoRepository> = {
      getLiving: vi.fn().mockResolvedValue(living),
      rename,
      getConfig: vi.fn().mockResolvedValue(guildConfig),
      rankings: vi.fn().mockResolvedValue([])
    };
    await dispatch(botWith(repository), {
      isButton: () => false,
      isModalSubmit: () => true,
      customId: NAME_MODAL_ID,
      guildId: "1001",
      user: { id: "2001" },
      fields: { getTextInputValue: () => "  まるちゃん  " },
      reply
    });

    expect(rename).toHaveBeenCalledWith("1001", "2001", "まるちゃん");
    expect(reply).toHaveBeenCalledWith({
      content: "まりもの名前を **まるちゃん** に変更しました。",
      ephemeral: true
    });
  });
});
