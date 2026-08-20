import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import {
  PermissionFlagsBits,
  PermissionsBitField,
  TextChannel,
  type Client,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type ModalBuilder
} from "discord.js";
import type { Config } from "../config/env.js";
import type { MarimoRepository } from "../db/repository.js";
import type {
  DeadMarimo,
  GuildConfig,
  RankingEntry,
  Watering
} from "../domain/types.js";
import type { XpDelivery } from "../services/xp-delivery.js";
import {
  hasMarimoAccess,
  isMarimoImageLog,
  MarimoBot,
  missingLogPermissions,
  missingPanelPermissions
} from "./bot.js";
import {
  deathLogContent,
  NAME_BUTTON_ID,
  NAME_MODAL_ID,
  MOSS_COLA_REVIVE_CANCEL_BUTTON_ID,
  MOSS_COLA_REVIVE_BUTTON_ID,
  MOSS_COLA_REVIVE_CONFIRM_BUTTON_ID,
  mossColaRescueButtonId,
  mossColaRescueConfirmButtonId,
  mossColaRescueConfirmTarget,
  mossColaRescueTarget,
  REMINDER_BUTTON_ID,
  REMINDER_HOUR_BUTTON_PREFIX,
  REMINDER_OFF_BUTTON_ID,
  REVIVE_BUTTON_ID,
  STATUS_BUTTON_ID,
  WATER_BUTTON_ID
} from "./presentation.js";

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
  sizePanelMessageId: null,
  deadPanelChannelId: null,
  deadPanelMessageId: null
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
  awardedXp: 100,
  isBirth: false,
  dialogueId: "everyday-01-01"
};

const death: DeadMarimo = {
  ...living,
  diedAt: new Date("2026-08-10T01:00:00Z"),
  finalSizeMm: 10.01
};

type InteractionDispatcher = {
  handleInteraction(interaction: Interaction): Promise<void>;
};

type RankingUpdater = {
  client: { guilds: { cache: Map<string, unknown> } };
  updateRankings(guildId: string, now: Date): Promise<void>;
  refreshRankingPanels(): Promise<void>;
  refreshWaterPanels(): Promise<void>;
  editRanking(
    channelId: string | null,
    messageId: string | null,
    entries: RankingEntry[],
    now: Date
  ): Promise<void>;
  editDeadRanking(
    channelId: string | null,
    messageId: string | null,
    entries: DeadMarimo[],
    now: Date
  ): Promise<void>;
  fetchMessage(channelId: string, messageId: string): Promise<Message | null>;
};

type WateringLogDeliverer = {
  deliverWateringLog(watering: Watering): Promise<void>;
  deliverPendingWateringLogs(): Promise<void>;
  postWateringLog(watering: Watering): Promise<void>;
};

type LiveLogPoster = {
  client: Client;
  postWateringLog(watering: Watering): Promise<void>;
  postDeathLog(
    death: DeadMarimo,
    options?: { showRescueButton?: boolean }
  ): Promise<void>;
};

type ReminderDeliverer = {
  client: Client;
  deliverDueWateringReminders(now: Date): Promise<void>;
};

type WaterInteractionHarness = {
  deliverWateringLog(watering: Watering): Promise<void>;
  postDeathLog(
    death: DeadMarimo,
    options?: { showRescueButton?: boolean }
  ): Promise<void>;
  disablePreviousDeathRescue(guildId: string, userId: string): Promise<void>;
  fetchMessage(channelId: string, messageId: string): Promise<Message | null>;
  updateRankings(guildId: string, now: Date): Promise<void>;
  runInBackground(operation: string, task: () => Promise<void>): void;
};

type LogRefresher = {
  client: { user: { id: string } | null };
  fetchMessage(channelId: string, messageId: string): Promise<Message | null>;
  repostAllLogs(interaction: ChatInputCommandInteraction): Promise<void>;
  findMarimoLogs(channel: TextChannel, botUserId: string): Promise<Message[]>;
  postWateringLogToChannel(
    channel: TextChannel,
    watering: Watering,
    options: { notifyOwner: boolean; deliveryKey?: string }
  ): Promise<void>;
  postDeathLogToChannel(
    channel: TextChannel,
    death: DeadMarimo,
    options: {
      notifyOwner: boolean;
      deliveryKey?: string;
      showRescueButton?: boolean;
    }
  ): Promise<void>;
};

type ClientAccessor = {
  client: { user: { id: string } | null };
};

type PanelPoster = {
  client: { user: { id: string } | null };
  postPanel(interaction: ChatInputCommandInteraction): Promise<void>;
  deactivateOldPanel(
    config: GuildConfig,
    kind: "water" | "size" | "dead"
  ): Promise<void>;
};

function botWith(
  repository: Partial<MarimoRepository>,
  xpDelivery: Partial<XpDelivery> = {}
): MarimoBot {
  return new MarimoBot(
    {
      allowedRoleIds: vi.fn().mockResolvedValue([]),
      getWateringReminderHour: vi.fn().mockResolvedValue(null),
      latestDeathLogMessage: vi.fn().mockResolvedValue(null),
      recordDeathLogMessage: vi.fn().mockResolvedValue(undefined),
      ...repository
    } as MarimoRepository,
    xpDelivery as XpDelivery,
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

function rescueConfirmationId(
  dead: DeadMarimo,
  sourceMessageId: string
): string {
  const target = mossColaRescueTarget(mossColaRescueButtonId(dead));
  if (target === null) throw new Error("Expected a valid moss-cola target");
  return mossColaRescueConfirmButtonId(target, sourceMessageId);
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

function textChannelWithSend(
  send: (...args: unknown[]) => Promise<unknown>,
  flags: bigint[] = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ]
): TextChannel {
  const channel = Object.create(TextChannel.prototype) as TextChannel;
  Object.defineProperties(channel, {
    id: { value: "3001" },
    send: {
      value: async (...args: unknown[]) =>
        (await send(...args)) ?? { id: "test-message" }
    },
    permissionsFor: {
      value: () => new PermissionsBitField(flags)
    }
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

  it("requires embed permission for persistent panels", () => {
    const permissions = new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages
    ]);

    expect(missingPanelPermissions(permissions)).toEqual(["リンクを埋め込む"]);
  });

  it("allows everyone when roles are unset and otherwise requires a role or manager", () => {
    expect(hasMarimoAccess([], [], false)).toBe(true);
    expect(hasMarimoAccess(["allowed"], ["allowed"], false)).toBe(true);
    expect(hasMarimoAccess(["first", "second"], ["second"], false)).toBe(true);
    expect(hasMarimoAccess(["allowed"], ["other"], false)).toBe(false);
    expect(hasMarimoAccess(["allowed"], [], true)).toBe(true);
  });

  it("opens the naming modal from the panel button", async () => {
    const showModal = vi
      .fn<(modal: ModalBuilder) => Promise<void>>()
      .mockResolvedValue(undefined);
    await dispatch(
      botWith({
        allowedRoleIds: vi.fn().mockResolvedValue(["5001"]),
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "4001"
        }),
        getLiving: vi.fn().mockResolvedValue(living)
      }),
      {
        isButton: () => true,
        customId: NAME_BUTTON_ID,
        guildId: "1001",
        channelId: "3001",
        message: { id: "4001" },
        user: { id: "2001" },
        member: { roles: ["5001"] },
        memberPermissions: new PermissionsBitField([]),
        showModal
      }
    );

    expect(showModal).toHaveBeenCalledOnce();
    expect(showModal.mock.calls[0]?.[0].toJSON()).toMatchObject({
      custom_id: NAME_MODAL_ID
    });
  });

  it("blocks every user action when none of the configured roles match", async () => {
    const water = vi.fn();
    const getLiving = vi.fn();
    const rename = vi.fn();
    const repository: Partial<MarimoRepository> = {
      allowedRoleIds: vi.fn().mockResolvedValue(["5001", "5002"]),
      getConfig: vi.fn().mockResolvedValue({
        ...guildConfig,
        waterPanelChannelId: "3001",
        waterPanelMessageId: "4001"
      }),
      water,
      getLiving,
      rename
    };
    const expected = {
      content: [
        "まりもBotを利用するには、次のロールのいずれかが必要です。",
        "<@&5001>、<@&5002>"
      ].join("\n"),
      ephemeral: true,
      allowedMentions: { parse: [] }
    };

    for (const customId of [
      WATER_BUTTON_ID,
      STATUS_BUTTON_ID,
      NAME_BUTTON_ID,
      REVIVE_BUTTON_ID,
      MOSS_COLA_REVIVE_BUTTON_ID,
      MOSS_COLA_REVIVE_CONFIRM_BUTTON_ID,
      REMINDER_BUTTON_ID,
      REMINDER_OFF_BUTTON_ID,
      `${REMINDER_HOUR_BUTTON_PREFIX}21`
    ]) {
      const reply = vi.fn().mockResolvedValue(undefined);
      await dispatch(botWith(repository), {
        isButton: () => true,
        customId,
        guildId: "1001",
        channelId: "3001",
        message: { id: "4001" },
        user: { id: "2001" },
        member: { roles: ["other"] },
        memberPermissions: new PermissionsBitField([]),
        reply
      });
      expect(reply).toHaveBeenCalledWith(expected);
    }

    const modalReply = vi.fn().mockResolvedValue(undefined);
    await dispatch(botWith(repository), {
      isButton: () => false,
      isModalSubmit: () => true,
      customId: NAME_MODAL_ID,
      guildId: "1001",
      user: { id: "2001" },
      member: { roles: ["other"] },
      memberPermissions: new PermissionsBitField([]),
      reply: modalReply
    });

    expect(modalReply).toHaveBeenCalledWith(expected);
    expect(water).not.toHaveBeenCalled();
    expect(getLiving).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });

  it("lets a server manager use the panel without querying role restrictions", async () => {
    const allowedRoleIds = vi.fn();
    const showModal = vi.fn().mockResolvedValue(undefined);
    await dispatch(
      botWith({
        allowedRoleIds,
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "4001"
        }),
        getLiving: vi.fn().mockResolvedValue(living)
      }),
      {
        isButton: () => true,
        customId: NAME_BUTTON_ID,
        guildId: "1001",
        channelId: "3001",
        message: { id: "4001" },
        user: { id: "2001" },
        member: { roles: [] },
        memberPermissions: new PermissionsBitField([
          PermissionFlagsBits.ManageGuild
        ]),
        showModal
      }
    );

    expect(allowedRoleIds).not.toHaveBeenCalled();
    expect(showModal).toHaveBeenCalledOnce();
  });

  it("shows the current tank image only to the owner from the panel channel", async () => {
    const getLiving = vi.fn().mockResolvedValue({
      ...living,
      name: "まるぽん",
      dialogueId: "everyday-01-01"
    });
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);

    await dispatch(
      botWith({
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "4001"
        }),
        getLiving
      }),
      {
        isButton: () => true,
        customId: STATUS_BUTTON_ID,
        guildId: "1001",
        channelId: "3001",
        message: { id: "4001" },
        user: { id: "2001" },
        member: { roles: [] },
        memberPermissions: new PermissionsBitField([]),
        deferReply,
        editReply
      }
    );

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(getLiving).toHaveBeenCalledWith("1001", "2001", expect.any(Date));
    expect(editReply).toHaveBeenCalledOnce();
    const reply = editReply.mock.calls[0]?.[0] as
      | {
          content: string;
          files: {
            attachment: unknown;
            name: string | null;
          }[];
        }
      | undefined;
    expect(reply?.content).toContain("# 🟢 まるぽん");
    expect(reply?.content).toContain("大きさ **10.00 mm**");
    expect(reply?.content).toContain("水換え通知 **OFF**");
    expect(reply?.content).toContain(
      "> 🟢 まるぽん「底の石が動いた気がする。石は知らないって。ぼくは今日も動いてないから、たぶん関係ない。」"
    );
    expect(reply?.files).toHaveLength(1);
    expect(reply?.files[0]?.name).toBe("marimo-tank.png");
    expect(Buffer.isBuffer(reply?.files[0]?.attachment)).toBe(true);
  });

  it("keeps the personal status private when no living marimo exists", async () => {
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);

    await dispatch(
      botWith({
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "4001"
        }),
        getLiving: vi.fn().mockResolvedValue(null)
      }),
      {
        isButton: () => true,
        customId: STATUS_BUTTON_ID,
        guildId: "1001",
        channelId: "3001",
        message: { id: "4001" },
        user: { id: "2001" },
        member: { roles: [] },
        memberPermissions: new PermissionsBitField([]),
        deferReply,
        editReply
      }
    );

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReply).toHaveBeenCalledWith({
      content:
        "生きているまりもはいません。「育て始める・水を替える」から始めましょう。"
    });
  });

  it("opens the owner's opt-in reminder settings from the current panel", async () => {
    const getWateringReminderHour = vi.fn().mockResolvedValue(null);
    const reply = vi.fn().mockResolvedValue(undefined);

    await dispatch(
      botWith({
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "4001"
        }),
        getWateringReminderHour
      }),
      {
        isButton: () => true,
        customId: REMINDER_BUTTON_ID,
        guildId: "1001",
        channelId: "3001",
        message: { id: "4001" },
        user: { id: "2001" },
        member: { roles: [] },
        memberPermissions: new PermissionsBitField([]),
        reply
      }
    );

    expect(getWateringReminderHour).toHaveBeenCalledWith("1001", "2001");
    const payload = reply.mock.calls[0]?.[0] as
      | {
          content: string;
          ephemeral: boolean;
          components: unknown[];
          allowedMentions: { parse: string[] };
        }
      | undefined;
    expect(payload?.content).toContain("現在: **OFF**");
    expect(payload?.ephemeral).toBe(true);
    expect(payload?.components).toHaveLength(1);
    expect(payload?.allowedMentions).toEqual({ parse: [] });
  });

  it("updates reminder time and OFF without requiring another panel post", async () => {
    const setWateringReminderHour = vi.fn().mockResolvedValue(undefined);
    const bot = botWith({ setWateringReminderHour });
    const enabledUpdate = vi.fn().mockResolvedValue(undefined);
    const disabledUpdate = vi.fn().mockResolvedValue(undefined);

    await dispatch(bot, {
      isButton: () => true,
      customId: `${REMINDER_HOUR_BUTTON_PREFIX}18`,
      guildId: "1001",
      user: { id: "2001" },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      update: enabledUpdate
    });
    await dispatch(bot, {
      isButton: () => true,
      customId: REMINDER_OFF_BUTTON_ID,
      guildId: "1001",
      user: { id: "2001" },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      update: disabledUpdate
    });

    expect(setWateringReminderHour).toHaveBeenNthCalledWith(
      1,
      "1001",
      "2001",
      18
    );
    expect(setWateringReminderHour).toHaveBeenNthCalledWith(
      2,
      "1001",
      "2001",
      null
    );
    const enabledPayload = enabledUpdate.mock.calls[0]?.[0] as
      { content: string } | undefined;
    const disabledPayload = disabledUpdate.mock.calls[0]?.[0] as
      { content: string } | undefined;
    expect(enabledPayload?.content).toContain("毎日 **18:00（日本時間）**");
    expect(disabledPayload?.content).toContain("現在: **OFF**");
  });

  it("rejects a copied or superseded panel before changing data", async () => {
    const getLiving = vi.fn().mockResolvedValue(living);
    const reply = vi.fn().mockResolvedValue(undefined);
    const showModal = vi.fn().mockResolvedValue(undefined);
    await dispatch(
      botWith({
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "current-message"
        }),
        getLiving
      }),
      {
        isButton: () => true,
        customId: NAME_BUTTON_ID,
        guildId: "1001",
        channelId: "3001",
        message: { id: "old-message" },
        user: { id: "2001" },
        reply,
        showModal
      }
    );

    expect(reply).toHaveBeenCalledWith({
      content:
        "このパネルは古いため操作できません。現在の水替えパネルを使ってください。",
      ephemeral: true
    });
    expect(getLiving).not.toHaveBeenCalled();
    expect(showModal).not.toHaveBeenCalled();
  });

  it("passes the base XP to daily care and shows the increasing reward", async () => {
    const secondDayWatering: Watering = {
      ...watering,
      ageDays: 2,
      sizeMm: 10.3,
      awardedXp: 110,
      isBirth: false
    };
    const water = vi.fn().mockResolvedValue({
      status: "watered",
      watering: secondDayWatering
    });
    const bot = botWith({
      getConfig: vi.fn().mockResolvedValue({
        ...guildConfig,
        waterPanelChannelId: "3001",
        waterPanelMessageId: "4001"
      }),
      water
    });
    const harness = bot as unknown as WaterInteractionHarness;
    harness.deliverWateringLog = vi.fn().mockResolvedValue(undefined);
    harness.updateRankings = vi.fn().mockResolvedValue(undefined);
    harness.runInBackground = vi.fn();
    const editReply = vi.fn().mockResolvedValue(undefined);

    await dispatch(bot, {
      isButton: () => true,
      customId: WATER_BUTTON_ID,
      guildId: "1001",
      channelId: "3001",
      message: { id: "4001" },
      user: { id: "2001", username: "owner", globalName: null },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply
    });

    expect(water).toHaveBeenCalledWith({
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      displayName: "owner",
      now: expect.any(Date),
      baseXp: 100
    });
    expect(editReply).toHaveBeenCalledWith({
      content: [
        "水がきれいになりました。",
        "連続飼育 **2日**｜**10.30 mm**",
        "本日 **+110 XP**｜明日は **120 XP**"
      ].join("\n")
    });
  });

  it("posts a death without a rescue button when watering starts the next generation", async () => {
    const nextGeneration: Watering = {
      ...watering,
      marimo: { ...living, id: "2", generation: 2 },
      isBirth: true
    };
    const bot = botWith({
      getConfig: vi.fn().mockResolvedValue({
        ...guildConfig,
        waterPanelChannelId: "3001",
        waterPanelMessageId: "4001"
      }),
      water: vi.fn().mockResolvedValue({
        status: "watered",
        watering: nextGeneration,
        death
      })
    });
    const harness = bot as unknown as WaterInteractionHarness;
    const postDeathLog = vi.fn().mockResolvedValue(undefined);
    const disablePreviousDeathRescue = vi.fn().mockResolvedValue(undefined);
    harness.postDeathLog = postDeathLog;
    harness.disablePreviousDeathRescue = disablePreviousDeathRescue;
    harness.deliverWateringLog = vi.fn().mockResolvedValue(undefined);
    harness.updateRankings = vi.fn().mockResolvedValue(undefined);
    harness.runInBackground = vi.fn();

    await dispatch(bot, {
      isButton: () => true,
      customId: WATER_BUTTON_ID,
      guildId: "1001",
      channelId: "3001",
      message: { id: "4001" },
      user: { id: "2001", username: "owner", globalName: null },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined)
    });

    expect(postDeathLog).toHaveBeenCalledWith(death, {
      showRescueButton: false
    });
    expect(disablePreviousDeathRescue).toHaveBeenCalledWith("1001", "2001");
  });

  it("disables the stored death-log rescue when a new generation starts", async () => {
    const editLog = vi.fn().mockResolvedValue(undefined);
    const latestDeathLogMessage = vi.fn().mockResolvedValue({
      channelId: "log-channel",
      messageId: "death-message"
    });
    const harness = botWith({
      latestDeathLogMessage
    }) as unknown as WaterInteractionHarness;
    const fetchMessage = vi.fn().mockResolvedValue({
      content: deathLogContent(death),
      edit: editLog
    });
    harness.fetchMessage = fetchMessage;

    await harness.disablePreviousDeathRescue("1001", "2001");

    expect(latestDeathLogMessage).toHaveBeenCalledWith("1001", "2001");
    expect(fetchMessage).toHaveBeenCalledWith("log-channel", "death-message");
    expect(editLog).toHaveBeenCalledWith({
      content: deathLogContent(death, false),
      components: []
    });
  });

  it("charges 1,000 XP once and revives the same marimo generation", async () => {
    const eventId = "00000000-0000-4000-8000-000000000099";
    const requestedAt = new Date("2026-08-12T03:00:00Z");
    const prepareRevival = vi.fn().mockResolvedValue({
      status: "ready",
      eventId,
      channelId: "3001",
      requestedAt,
      death,
      newlyDied: false
    });
    const completeRevival = vi.fn().mockResolvedValue({
      ...living,
      eventId,
      costXp: 1000,
      ageDays: 1,
      sizeMm: 10.01
    });
    const spendRevival = vi.fn().mockResolvedValue({
      status: "charged",
      costXp: 1000,
      remainingXp: 250,
      duplicate: false
    });
    const bot = botWith(
      {
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "4001"
        }),
        prepareRevival,
        completeRevival
      },
      { revivalEnabled: true, spendRevival }
    );
    (bot as unknown as WaterInteractionHarness).updateRankings = vi
      .fn()
      .mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);

    await dispatch(bot, {
      isButton: () => true,
      customId: REVIVE_BUTTON_ID,
      guildId: "1001",
      channelId: "3001",
      message: { id: "4001" },
      user: { id: "2001", username: "owner", globalName: null },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply
    });

    expect(spendRevival).toHaveBeenCalledWith({
      eventId,
      guildId: "1001",
      userId: "2001",
      channelId: "3001",
      observedAt: requestedAt
    });
    expect(completeRevival).toHaveBeenCalledWith({
      eventId,
      guildId: "1001",
      ownerUserId: "2001",
      rescuerUserId: "2001",
      paymentMethod: "xp",
      costXp: 1000,
      now: expect.any(Date)
    });
    expect(editReply).toHaveBeenCalledWith({
      content: [
        "🌿 **まりも** が生き返りました。",
        "第1世代｜飼育 **1日**｜**10.01 mm**",
        "**-1,000 XP**｜残り **250 XP**"
      ].join("\n")
    });
  });

  it("explains moss-cola and asks before consuming it from the panel", async () => {
    const prepareRevival = vi.fn();
    const spendRevivalItem = vi.fn();
    const reply = vi.fn().mockResolvedValue(undefined);

    await dispatch(
      botWith(
        {
          getConfig: vi.fn().mockResolvedValue({
            ...guildConfig,
            waterPanelChannelId: "3001",
            waterPanelMessageId: "4001"
          }),
          prepareRevival
        },
        { itemRevivalEnabled: true, spendRevivalItem }
      ),
      {
        isButton: () => true,
        customId: MOSS_COLA_REVIVE_BUTTON_ID,
        guildId: "1001",
        channelId: "3001",
        message: { id: "4001" },
        user: { id: "2001" },
        member: { roles: [] },
        memberPermissions: new PermissionsBitField([]),
        reply
      }
    );

    const payload = reply.mock.calls[0]?.[0] as
      | {
          content: string;
          ephemeral: boolean;
          components: { components: { toJSON(): { custom_id?: string } }[] }[];
        }
      | undefined;
    expect(payload?.content).toContain("**カフェ・コレクション**");
    expect(payload?.content).toContain("重複分を1本消費します");
    expect(payload?.ephemeral).toBe(true);
    expect(
      payload?.components[0]?.components.map(
        (component) => component.toJSON().custom_id
      )
    ).toContain(MOSS_COLA_REVIVE_CONFIRM_BUTTON_ID);
    expect(prepareRevival).not.toHaveBeenCalled();
    expect(spendRevivalItem).not.toHaveBeenCalled();
  });

  it("keeps the source death log in the rescue confirmation", async () => {
    const prepareRevival = vi.fn();
    const spendRevivalItem = vi.fn();
    const reply = vi.fn().mockResolvedValue(undefined);

    await dispatch(
      botWith(
        { prepareRevival },
        { itemRevivalEnabled: true, spendRevivalItem }
      ),
      {
        isButton: () => true,
        customId: mossColaRescueButtonId(death),
        guildId: "1001",
        channelId: "log-channel",
        message: { id: "900000000000000000" },
        user: { id: "helper-user" },
        member: { roles: [] },
        memberPermissions: new PermissionsBitField([]),
        reply
      }
    );

    const payload = reply.mock.calls[0]?.[0] as
      | {
          content: string;
          ephemeral: boolean;
          components: { components: { toJSON(): { custom_id?: string } }[] }[];
        }
      | undefined;
    const confirmId = payload?.components[0]?.components[0]?.toJSON().custom_id;
    expect(payload?.content).toContain("このまりもを助けますか");
    expect(payload?.ephemeral).toBe(true);
    expect(confirmId).toBeDefined();
    expect(mossColaRescueConfirmTarget(confirmId ?? "")).toMatchObject({
      ownerUserId: "2001",
      marimoId: death.id,
      diedAt: death.diedAt,
      sourceMessageId: "900000000000000000"
    });
    expect(prepareRevival).not.toHaveBeenCalled();
    expect(spendRevivalItem).not.toHaveBeenCalled();
  });

  it("cancels moss-cola revival without consuming it", async () => {
    const prepareRevival = vi.fn();
    const spendRevivalItem = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);

    await dispatch(
      botWith(
        { prepareRevival },
        { itemRevivalEnabled: true, spendRevivalItem }
      ),
      {
        isButton: () => true,
        customId: MOSS_COLA_REVIVE_CANCEL_BUTTON_ID,
        guildId: "1001",
        user: { id: "2001" },
        update
      }
    );

    expect(update).toHaveBeenCalledWith({
      content: "復活をやめました。苔コーラは消費していません。",
      components: []
    });
    expect(prepareRevival).not.toHaveBeenCalled();
    expect(spendRevivalItem).not.toHaveBeenCalled();
  });

  it("lets another user revive the exact logged death with a moss-cola duplicate", async () => {
    const eventId = "00000000-0000-4000-8000-000000000199";
    const requestedAt = new Date("2026-08-12T03:00:00Z");
    const prepareRevival = vi.fn().mockResolvedValue({
      status: "ready",
      eventId,
      channelId: "log-channel",
      requestedAt,
      death,
      newlyDied: false
    });
    const completeRevival = vi.fn().mockResolvedValue({
      ...living,
      eventId,
      costXp: 0,
      ageDays: 1,
      sizeMm: 10.01
    });
    const spendRevivalItem = vi.fn().mockResolvedValue({
      status: "consumed",
      cardKey: "moss-cola",
      remainingCount: 1,
      duplicate: false
    });
    const bot = botWith(
      { prepareRevival, completeRevival },
      { itemRevivalEnabled: true, spendRevivalItem }
    );
    (bot as unknown as WaterInteractionHarness).updateRankings = vi
      .fn()
      .mockResolvedValue(undefined);
    const editLog = vi.fn().mockResolvedValue(undefined);
    const fetchMessage = vi.fn().mockResolvedValue({ edit: editLog });
    (bot as unknown as LogRefresher).fetchMessage = fetchMessage;
    const editReply = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(undefined);

    await dispatch(bot, {
      isButton: () => true,
      customId: rescueConfirmationId(death, "900000000000000000"),
      guildId: "1001",
      channelId: "log-channel",
      message: { id: "confirmation-message" },
      user: { id: "helper-user", username: "helper", globalName: null },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      update,
      editReply
    });

    expect(prepareRevival).toHaveBeenCalledWith({
      guildId: "1001",
      ownerUserId: "2001",
      rescuerUserId: "helper-user",
      channelId: "log-channel",
      paymentMethod: "moss-cola",
      expectedMarimoId: death.id,
      expectedDiedAt: death.diedAt,
      now: expect.any(Date)
    });
    expect(spendRevivalItem).toHaveBeenCalledWith({
      eventId,
      guildId: "1001",
      userId: "helper-user",
      channelId: "log-channel",
      observedAt: requestedAt
    });
    expect(completeRevival).toHaveBeenCalledWith({
      eventId,
      guildId: "1001",
      ownerUserId: "2001",
      rescuerUserId: "helper-user",
      paymentMethod: "moss-cola",
      costXp: 0,
      now: expect.any(Date)
    });
    expect(fetchMessage).toHaveBeenCalledWith(
      "log-channel",
      "900000000000000000"
    );
    expect(editLog).toHaveBeenCalledWith({
      content: expect.stringContaining("<@helper-user> が <@2001>"),
      components: [],
      allowedMentions: { parse: [] }
    });
    const editedLog = editLog.mock.calls[0]?.[0] as
      { content: string } | undefined;
    expect(editedLog?.content).not.toContain("苔コーラとは");
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining("苔コーラを1本使いました")
    });
    expect(update).toHaveBeenCalledWith({
      content: "苔コーラを確認しています…",
      components: []
    });
  });

  it("disables an old rescue button when the owner has a newer living generation", async () => {
    const spendRevivalItem = vi.fn();
    const editLog = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const fetchMessage = vi.fn().mockResolvedValue({
      content: deathLogContent(death),
      edit: editLog
    });
    const bot = botWith(
      { prepareRevival: vi.fn().mockResolvedValue({ status: "alive" }) },
      { itemRevivalEnabled: true, spendRevivalItem }
    );
    (bot as unknown as LogRefresher).fetchMessage = fetchMessage;

    await dispatch(bot, {
      isButton: () => true,
      customId: rescueConfirmationId(death, "900000000000000002"),
      guildId: "1001",
      channelId: "log-channel",
      message: { id: "confirmation-message" },
      user: { id: "helper-user", username: "helper", globalName: null },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      update: vi.fn().mockResolvedValue(undefined),
      editReply
    });

    expect(spendRevivalItem).not.toHaveBeenCalled();
    expect(fetchMessage).toHaveBeenCalledWith(
      "log-channel",
      "900000000000000002"
    );
    expect(editLog).toHaveBeenCalledWith({
      content: deathLogContent(death, false),
      components: []
    });
    expect(editReply).toHaveBeenCalledWith({
      content:
        "持ち主には現在育成中のまりもがいるため、この死亡記録からは復活できません。苔コーラは消費していません。"
    });
  });

  it("does not disable the main panel when its self-revival button finds a living marimo", async () => {
    const spendRevivalItem = vi.fn();
    const fetchMessage = vi.fn();
    const editReply = vi.fn().mockResolvedValue(undefined);
    const bot = botWith(
      { prepareRevival: vi.fn().mockResolvedValue({ status: "alive" }) },
      { itemRevivalEnabled: true, spendRevivalItem }
    );
    (bot as unknown as LogRefresher).fetchMessage = fetchMessage;

    await dispatch(bot, {
      isButton: () => true,
      customId: MOSS_COLA_REVIVE_CONFIRM_BUTTON_ID,
      guildId: "1001",
      channelId: "3001",
      message: { id: "confirmation-message" },
      user: { id: "2001", username: "owner", globalName: null },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      update: vi.fn().mockResolvedValue(undefined),
      editReply
    });

    expect(spendRevivalItem).not.toHaveBeenCalled();
    expect(fetchMessage).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith({
      content:
        "このまりもはすでに元気に生きています。苔コーラは消費していません。"
    });
  });

  it("does not consume moss-cola from a stale death log", async () => {
    const spendRevivalItem = vi.fn();
    const editLog = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const fetchMessage = vi.fn().mockResolvedValue({
      content: deathLogContent(death),
      edit: editLog
    });
    const bot = botWith(
      { prepareRevival: vi.fn().mockResolvedValue({ status: "stale-death" }) },
      { itemRevivalEnabled: true, spendRevivalItem }
    );
    (bot as unknown as LogRefresher).fetchMessage = fetchMessage;

    await dispatch(bot, {
      isButton: () => true,
      customId: rescueConfirmationId(death, "900000000000000001"),
      guildId: "1001",
      channelId: "log-channel",
      message: { id: "confirmation-message" },
      user: { id: "helper-user", username: "helper", globalName: null },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      update: vi.fn().mockResolvedValue(undefined),
      editReply
    });

    expect(spendRevivalItem).not.toHaveBeenCalled();
    expect(fetchMessage).toHaveBeenCalledWith(
      "log-channel",
      "900000000000000001"
    );
    expect(editLog).toHaveBeenCalledWith({
      content: deathLogContent(death, false),
      components: []
    });
    expect(editReply).toHaveBeenCalledWith({
      content:
        "この死亡記録は古いため復活できません。苔コーラは消費していません。"
    });
  });

  it("releases a pending revival when XP is insufficient", async () => {
    const eventId = "00000000-0000-4000-8000-000000000098";
    const cancelRevival = vi.fn().mockResolvedValue(undefined);
    const bot = botWith(
      {
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "4001"
        }),
        prepareRevival: vi.fn().mockResolvedValue({
          status: "ready",
          eventId,
          channelId: "3001",
          requestedAt: new Date("2026-08-12T03:00:00Z"),
          death,
          newlyDied: false
        }),
        cancelRevival
      },
      {
        revivalEnabled: true,
        spendRevival: vi.fn().mockResolvedValue({
          status: "insufficient_xp",
          costXp: 1000,
          remainingXp: 999,
          duplicate: false
        })
      }
    );
    const editReply = vi.fn().mockResolvedValue(undefined);

    await dispatch(bot, {
      isButton: () => true,
      customId: REVIVE_BUTTON_ID,
      guildId: "1001",
      channelId: "3001",
      message: { id: "4001" },
      user: { id: "2001", username: "owner", globalName: null },
      member: { roles: [] },
      memberPermissions: new PermissionsBitField([]),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply
    });

    expect(cancelRevival).toHaveBeenCalledWith({
      eventId,
      guildId: "1001",
      ownerUserId: "2001",
      rescuerUserId: "2001",
      paymentMethod: "xp"
    });
    expect(editReply).toHaveBeenCalledWith({
      content: "復活には **1,000 XP** 必要です。現在は **999 XP** です。"
    });
  });

  it("asks the user to start raising before opening the name modal", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const showModal = vi.fn().mockResolvedValue(undefined);
    await dispatch(
      botWith({
        getConfig: vi.fn().mockResolvedValue({
          ...guildConfig,
          waterPanelChannelId: "3001",
          waterPanelMessageId: "4001"
        }),
        getLiving: vi.fn().mockResolvedValue(null)
      }),
      {
        isButton: () => true,
        customId: NAME_BUTTON_ID,
        guildId: "1001",
        channelId: "3001",
        message: { id: "4001" },
        user: { id: "2001" },
        reply,
        showModal
      }
    );

    expect(reply).toHaveBeenCalledWith({
      content: "先に「育て始める・水を替える」からまりもを育て始めてください。",
      ephemeral: true
    });
    expect(showModal).not.toHaveBeenCalled();
  });

  it("keeps the old panel active if posting its replacement fails", async () => {
    const setPanel = vi.fn().mockResolvedValue(undefined);
    const bot = botWith({
      getConfig: vi.fn().mockResolvedValue(guildConfig),
      rankings: vi.fn().mockResolvedValue([]),
      setPanel
    }) as unknown as PanelPoster;
    Object.defineProperty(bot.client, "user", { value: { id: "bot" } });
    const deactivateOldPanel = vi.fn().mockResolvedValue(undefined);
    bot.deactivateOldPanel = deactivateOldPanel;
    const send = vi.fn().mockRejectedValue(new Error("Discord send failed"));

    await expect(
      bot.postPanel({
        guildId: "1001",
        channel: textChannelWithSend(send),
        options: { getString: () => "water" },
        deferReply: vi.fn().mockResolvedValue(undefined)
      } as unknown as ChatInputCommandInteraction)
    ).rejects.toThrow("Discord send failed");

    expect(setPanel).not.toHaveBeenCalled();
    expect(deactivateOldPanel).not.toHaveBeenCalled();
  });

  it("records a new panel before disabling the previous one", async () => {
    const setPanel = vi.fn().mockResolvedValue(undefined);
    const bot = botWith({
      getConfig: vi.fn().mockResolvedValue(guildConfig),
      rankings: vi.fn().mockResolvedValue([]),
      setPanel
    }) as unknown as PanelPoster;
    Object.defineProperty(bot.client, "user", { value: { id: "bot" } });
    const deactivateOldPanel = vi.fn().mockResolvedValue(undefined);
    bot.deactivateOldPanel = deactivateOldPanel;
    const send = vi.fn().mockResolvedValue({ id: "new-message" });

    await bot.postPanel({
      guildId: "1001",
      channel: textChannelWithSend(send),
      options: { getString: () => "water" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined)
    } as unknown as ChatInputCommandInteraction);

    expect(send.mock.invocationCallOrder[0]).toBeLessThan(
      setPanel.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(setPanel.mock.invocationCallOrder[0]).toBeLessThan(
      deactivateOldPanel.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it("posts the dead ranking as an independent persistent panel", async () => {
    const rankings = vi.fn().mockResolvedValue([living]);
    const deadRankings = vi.fn().mockResolvedValue([death]);
    const setPanel = vi.fn().mockResolvedValue(undefined);
    const oldConfig = {
      ...guildConfig,
      deadPanelChannelId: "old-dead-channel",
      deadPanelMessageId: "old-dead-message"
    };
    const bot = botWith({
      getConfig: vi.fn().mockResolvedValue(oldConfig),
      rankings,
      deadRankings,
      setPanel
    }) as unknown as PanelPoster;
    Object.defineProperty(bot.client, "user", { value: { id: "bot" } });
    const deactivateOldPanel = vi.fn().mockResolvedValue(undefined);
    bot.deactivateOldPanel = deactivateOldPanel;
    const send = vi.fn().mockResolvedValue({ id: "new-dead-message" });

    await bot.postPanel({
      guildId: "1001",
      channel: textChannelWithSend(send),
      options: { getString: () => "dead" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined)
    } as unknown as ChatInputCommandInteraction);

    expect(deadRankings).toHaveBeenCalledWith("1001");
    expect(rankings).not.toHaveBeenCalled();
    const payload = send.mock.calls[0]?.[0] as {
      embeds: { data: { title?: string; description?: string } }[];
    };
    expect(payload.embeds[0]?.data.title).toBe(
      "🥀 枯れたまりも大きさランキング"
    );
    expect(payload.embeds[0]?.data.description).toContain("<@2001>");
    expect(setPanel).toHaveBeenCalledWith(
      "1001",
      "dead",
      "3001",
      "new-dead-message"
    );
    expect(deactivateOldPanel).toHaveBeenCalledWith(oldConfig, "dead");
  });

  it("wires living and dead entries to their own ranking panels", async () => {
    const configured = {
      ...guildConfig,
      agePanelChannelId: "old-age-channel",
      agePanelMessageId: "old-age-message",
      sizePanelChannelId: "size-channel",
      sizePanelMessageId: "size-message",
      deadPanelChannelId: "dead-channel",
      deadPanelMessageId: "dead-message"
    };
    const repository: Partial<MarimoRepository> = {
      getConfig: vi.fn().mockResolvedValue(configured),
      rankings: vi.fn().mockResolvedValue([living]),
      deadRankings: vi.fn().mockResolvedValue([death])
    };
    const bot = botWith(repository) as unknown as RankingUpdater;
    const editRanking = vi.fn().mockResolvedValue(undefined);
    const editDeadRanking = vi.fn().mockResolvedValue(undefined);
    bot.editRanking = editRanking;
    bot.editDeadRanking = editDeadRanking;
    const now = new Date("2026-08-10T00:00:00Z");

    await bot.updateRankings("1001", now);

    expect(editRanking).toHaveBeenCalledOnce();
    expect(editRanking).toHaveBeenCalledWith(
      "size-channel",
      "size-message",
      [living],
      now
    );
    expect(editDeadRanking).toHaveBeenCalledOnce();
    expect(editDeadRanking).toHaveBeenCalledWith(
      "dead-channel",
      "dead-message",
      [death],
      now
    );
  });

  it("converts the existing water panel to an embed during refresh", async () => {
    const bot = botWith({
      getConfig: vi.fn().mockResolvedValue({
        ...guildConfig,
        waterPanelChannelId: "water-channel",
        waterPanelMessageId: "water-message"
      })
    }) as unknown as RankingUpdater;
    bot.client.guilds.cache.set("1001", {});
    const edit = vi.fn().mockResolvedValue(undefined);
    bot.fetchMessage = vi.fn().mockResolvedValue({ edit });

    await bot.refreshWaterPanels();

    expect(edit).toHaveBeenCalledOnce();
    expect(edit.mock.calls[0]?.[0]).toMatchObject({
      content: "",
      flags: [],
      allowedMentions: { parse: [] }
    });
    const payload = edit.mock.calls[0]?.[0] as {
      embeds: { data: { title?: string } }[];
      components: unknown[];
    };
    expect(payload.embeds[0]?.data.title).toBe("🟢 まりもちゃん");
    expect(payload.components).toHaveLength(2);
  });

  it("converts the existing ranking panel to an embed during update", async () => {
    const bot = botWith({}) as unknown as RankingUpdater;
    const edit = vi.fn().mockResolvedValue(undefined);
    bot.fetchMessage = vi.fn().mockResolvedValue({ edit });

    await bot.editRanking(
      "size-channel",
      "size-message",
      [living],
      new Date("2026-08-10T00:00:00Z")
    );

    expect(edit).toHaveBeenCalledOnce();
    expect(edit.mock.calls[0]?.[0]).toMatchObject({
      content: "",
      components: [],
      flags: [],
      allowedMentions: { parse: [] }
    });
    const payload = edit.mock.calls[0]?.[0] as {
      embeds: { data: { title?: string; description?: string } }[];
    };
    expect(payload.embeds[0]?.data.title).toBe("📏 巨大まりもランキング");
    expect(payload.embeds[0]?.data.description).toContain("<@2001>");
  });

  it("converts the existing dead ranking panel to an embed during update", async () => {
    const bot = botWith({}) as unknown as RankingUpdater;
    const edit = vi.fn().mockResolvedValue(undefined);
    bot.fetchMessage = vi.fn().mockResolvedValue({ edit });

    await bot.editDeadRanking(
      "dead-channel",
      "dead-message",
      [death],
      new Date("2026-08-10T00:00:00Z")
    );

    expect(edit).toHaveBeenCalledOnce();
    expect(edit.mock.calls[0]?.[0]).toMatchObject({
      content: "",
      components: [],
      flags: [],
      allowedMentions: { parse: [] }
    });
    const payload = edit.mock.calls[0]?.[0] as {
      embeds: { data: { title?: string; description?: string } }[];
    };
    expect(payload.embeds[0]?.data.title).toBe(
      "🥀 枯れたまりも大きさランキング"
    );
    expect(payload.embeds[0]?.data.description).toContain("<@2001>");
  });

  it("refreshes every existing ranking panel on startup", async () => {
    const bot = botWith({}) as unknown as RankingUpdater;
    bot.client.guilds.cache.set("1001", {});
    bot.client.guilds.cache.set("1002", {});
    const updateRankings = vi.fn().mockResolvedValue(undefined);
    bot.updateRankings = updateRankings;

    await bot.refreshRankingPanels();

    expect(updateRankings).toHaveBeenCalledTimes(2);
    expect(updateRankings).toHaveBeenNthCalledWith(1, "1001", expect.any(Date));
    expect(updateRankings).toHaveBeenNthCalledWith(2, "1002", expect.any(Date));
    expect(updateRankings.mock.calls[0]?.[1]).toEqual(
      updateRankings.mock.calls[1]?.[1]
    );
  });

  it("uses the command channel for marimo logs and reminders", async () => {
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
      options: {
        getSubcommand: () => "log",
        getSubcommandGroup: () => null
      },
      reply
    });

    expect(setLogChannel).toHaveBeenCalledWith("1001", "3001");
    expect(reply).toHaveBeenCalledWith({
      content: "まりもログと水替え通知の投稿先を <#3001> に設定しました。",
      ephemeral: true
    });
  });

  it("adds an allowed role through the admin command", async () => {
    const addAllowedRole = vi.fn().mockResolvedValue(true);
    const reply = vi.fn().mockResolvedValue(undefined);

    await dispatch(botWith({ addAllowedRole }), {
      isButton: () => false,
      isModalSubmit: () => false,
      isChatInputCommand: () => true,
      commandName: "marimo-admin",
      guildId: "1001",
      memberPermissions: new PermissionsBitField([
        PermissionFlagsBits.ManageGuild
      ]),
      options: {
        getSubcommand: () => "add",
        getSubcommandGroup: () => "role",
        getRole: () => ({ id: "5001" })
      },
      reply
    });

    expect(addAllowedRole).toHaveBeenCalledWith("1001", "5001");
    expect(reply).toHaveBeenCalledWith({
      content: "<@&5001> を利用可能ロールに追加しました。",
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  });

  it("removes the final allowed role and reports that access is open", async () => {
    const removeAllowedRole = vi.fn().mockResolvedValue(true);
    const allowedRoleIds = vi.fn().mockResolvedValue([]);
    const reply = vi.fn().mockResolvedValue(undefined);

    await dispatch(botWith({ removeAllowedRole, allowedRoleIds }), {
      isButton: () => false,
      isModalSubmit: () => false,
      isChatInputCommand: () => true,
      commandName: "marimo-admin",
      guildId: "1001",
      memberPermissions: new PermissionsBitField([
        PermissionFlagsBits.ManageGuild
      ]),
      options: {
        getSubcommand: () => "remove",
        getSubcommandGroup: () => "role",
        getRole: () => ({ id: "5001" })
      },
      reply
    });

    expect(removeAllowedRole).toHaveBeenCalledWith("1001", "5001");
    expect(allowedRoleIds).toHaveBeenCalledWith("1001");
    expect(reply).toHaveBeenCalledWith({
      content:
        "<@&5001> を削除しました。利用可能ロールが未設定になったため、全員が利用できます。",
      ephemeral: true,
      allowedMentions: { parse: [] }
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

  it("notifies live milestones but keeps midnight death logs silent", async () => {
    const send = vi.fn().mockResolvedValue({ id: "death-message" });
    const channel = textChannelWithSend(send);
    const recordDeathLogMessage = vi.fn().mockResolvedValue(undefined);
    const bot = botWith({
      getConfig: vi.fn().mockResolvedValue({
        ...guildConfig,
        logChannelId: "3001"
      }),
      recordDeathLogMessage
    }) as unknown as LiveLogPoster;
    vi.spyOn(bot.client.channels, "fetch").mockResolvedValue(channel);

    await bot.postWateringLog({ ...watering, ageDays: 2 });
    await bot.postWateringLog({
      ...watering,
      eventId: "00000000-0000-4000-8000-000000000002",
      ageDays: 4
    });
    await bot.postDeathLog(death);
    await bot.postDeathLog(death, { showRescueButton: false });

    const milestone = send.mock.calls[0]?.[0] as {
      content: string;
      allowedMentions: { parse: string[]; users?: string[] };
      nonce?: string;
      enforceNonce?: boolean;
    };
    expect(milestone.content).toContain("連続飼育 2日達成");
    expect(milestone.allowedMentions).toEqual({
      parse: [],
      users: ["2001"]
    });
    expect(milestone.nonce).toHaveLength(25);
    expect(milestone.enforceNonce).toBe(true);

    const ordinary = send.mock.calls[1]?.[0] as {
      content: string;
      allowedMentions: { parse: string[]; users?: string[] };
      nonce?: string;
    };
    expect(ordinary.content).not.toContain("達成");
    expect(ordinary.allowedMentions).toEqual({ parse: [] });
    expect(ordinary.nonce).not.toBe(milestone.nonce);

    const memorial = send.mock.calls[2]?.[0] as {
      content: string;
      components: unknown[];
      allowedMentions: { parse: string[]; users?: string[] };
      nonce?: string;
      enforceNonce?: boolean;
    };
    expect(memorial.content).toContain("枯れてしまいました");
    expect(memorial.content).not.toContain("<@2001>");
    expect(memorial.components).toHaveLength(1);
    expect(memorial.allowedMentions).toEqual({ parse: [] });
    expect(memorial.nonce).toHaveLength(25);
    expect(memorial.nonce).not.toBe(milestone.nonce);
    expect(memorial.enforceNonce).toBe(true);
    const inactiveMemorial = send.mock.calls[3]?.[0] as {
      content: string;
      components: unknown[];
    };
    expect(inactiveMemorial.content).not.toContain("苔コーラとは");
    expect(inactiveMemorial.components).toEqual([]);
    expect(recordDeathLogMessage).toHaveBeenCalledWith({
      marimoId: death.id,
      diedAt: death.diedAt,
      channelId: "3001",
      messageId: "death-message"
    });
  });

  it("posts an opted-in missed-care reminder only in the configured log channel", async () => {
    const reminder = {
      guildId: "1001",
      userId: "2001",
      marimoName: "まりも",
      logChannelId: "log-channel",
      reminderHour: 21 as const,
      reminderDate: "2026-08-11"
    };
    const claimDueWateringReminders = vi.fn().mockResolvedValue([reminder]);
    const wateringReminderStillDue = vi.fn().mockResolvedValue(true);
    const releaseWateringReminderClaim = vi.fn().mockResolvedValue(undefined);
    const bot = botWith({
      claimDueWateringReminders,
      wateringReminderStillDue,
      releaseWateringReminderClaim
    }) as unknown as ReminderDeliverer;
    const send = vi.fn().mockResolvedValue(undefined);
    const fetchChannel = vi
      .spyOn(bot.client.channels, "fetch")
      .mockResolvedValue(textChannelWithSend(send));
    const now = new Date("2026-08-11T12:00:00Z");

    await bot.deliverDueWateringReminders(now);

    expect(claimDueWateringReminders).toHaveBeenCalledWith(now);
    expect(wateringReminderStillDue).toHaveBeenCalledWith(
      "1001",
      "2001",
      "2026-08-11"
    );
    expect(fetchChannel).toHaveBeenCalledWith("log-channel");
    const payload = send.mock.calls[0]?.[0] as {
      content: string;
      allowedMentions: { parse: string[]; users: string[] };
      nonce: string;
      enforceNonce: boolean;
    };
    expect(payload.content).toContain("<@2001> さん");
    expect(payload.content).toContain("まりも** が、ぷかぷか待っています");
    expect(payload.allowedMentions).toEqual({ parse: [], users: ["2001"] });
    expect(payload.nonce).toHaveLength(25);
    expect(payload.enforceNonce).toBe(true);
    expect(releaseWateringReminderClaim).not.toHaveBeenCalled();
  });

  it("releases a failed reminder claim so its finite retry budget can continue", async () => {
    const reminder = {
      guildId: "1001",
      userId: "2001",
      marimoName: "まりも",
      logChannelId: "log-channel",
      reminderHour: 21 as const,
      reminderDate: "2026-08-11"
    };
    const releaseWateringReminderClaim = vi.fn().mockResolvedValue(undefined);
    const bot = botWith({
      claimDueWateringReminders: vi.fn().mockResolvedValue([reminder]),
      wateringReminderStillDue: vi.fn().mockResolvedValue(true),
      releaseWateringReminderClaim
    }) as unknown as ReminderDeliverer;
    vi.spyOn(bot.client.channels, "fetch").mockResolvedValue(
      textChannelWithSend(vi.fn().mockRejectedValue(new Error("send failed")))
    );

    await bot.deliverDueWateringReminders(new Date("2026-08-11T12:00:00Z"));

    expect(releaseWateringReminderClaim).toHaveBeenCalledWith(
      "1001",
      "2001",
      "2026-08-11"
    );
  });

  it("reposts the complete event history without a completion announcement", async () => {
    const laterWatering: Watering = {
      ...watering,
      eventId: "00000000-0000-4000-8000-000000000002",
      wateredAt: new Date("2026-08-10T02:00:00Z"),
      wateredDate: "2026-08-10",
      isBirth: false
    };
    const repository: Partial<MarimoRepository> = {
      setLogChannel: vi.fn().mockResolvedValue(undefined),
      wateringLogHistory: vi.fn().mockResolvedValue([watering, laterWatering]),
      deathLogHistory: vi.fn().mockResolvedValue([death]),
      revivableDeathKeys: vi.fn().mockResolvedValue(new Set()),
      markGuildWateringLogsDeliveredThrough: vi
        .fn()
        .mockResolvedValue(undefined)
    };
    const bot = botWith(repository) as unknown as LogRefresher;
    Object.defineProperty(bot.client, "user", { value: { id: "bot" } });
    const deleteOldLog = vi.fn().mockResolvedValue(undefined);
    const oldLog = { delete: deleteOldLog } as unknown as Message;
    const findMarimoLogs = vi.fn().mockResolvedValue([oldLog]);
    const postWateringLogToChannel = vi.fn().mockResolvedValue(undefined);
    const postDeathLogToChannel = vi.fn().mockResolvedValue(undefined);
    bot.findMarimoLogs = findMarimoLogs;
    bot.postWateringLogToChannel = postWateringLogToChannel;
    bot.postDeathLogToChannel = postDeathLogToChannel;
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
    expect(postWateringLogToChannel).toHaveBeenNthCalledWith(
      1,
      channel,
      watering,
      { notifyOwner: false }
    );
    expect(postDeathLogToChannel).toHaveBeenCalledWith(channel, death, {
      notifyOwner: false,
      showRescueButton: false
    });
    expect(postWateringLogToChannel).toHaveBeenNthCalledWith(
      2,
      channel,
      laterWatering,
      { notifyOwner: false }
    );
    expect(postWateringLogToChannel.mock.invocationCallOrder[0]).toBeLessThan(
      postDeathLogToChannel.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY
    );
    expect(postDeathLogToChannel.mock.invocationCallOrder[0]).toBeLessThan(
      postWateringLogToChannel.mock.invocationCallOrder[1] ??
        Number.POSITIVE_INFINITY
    );
    expect(postWateringLogToChannel.mock.invocationCallOrder[1]).toBeLessThan(
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
    const postWateringLogToChannel = vi.fn().mockResolvedValue(undefined);
    const postDeathLogToChannel = vi.fn().mockResolvedValue(undefined);
    bot.findMarimoLogs = findMarimoLogs;
    bot.postWateringLogToChannel = postWateringLogToChannel;
    bot.postDeathLogToChannel = postDeathLogToChannel;
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
    expect(postWateringLogToChannel).not.toHaveBeenCalled();
    expect(postDeathLogToChannel).not.toHaveBeenCalled();
    expect(setLogChannel).not.toHaveBeenCalled();
  });

  it("keeps every old log when a replacement post fails", async () => {
    const setLogChannel = vi.fn().mockResolvedValue(undefined);
    const repository: Partial<MarimoRepository> = {
      setLogChannel,
      wateringLogHistory: vi.fn().mockResolvedValue([watering]),
      deathLogHistory: vi.fn().mockResolvedValue([]),
      revivableDeathKeys: vi.fn().mockResolvedValue(new Set())
    };
    const bot = botWith(repository) as unknown as LogRefresher;
    Object.defineProperty(bot.client, "user", { value: { id: "bot" } });
    const deleteOldLog = vi.fn().mockResolvedValue(undefined);
    bot.findMarimoLogs = vi.fn().mockResolvedValue([{ delete: deleteOldLog }]);
    bot.postWateringLogToChannel = vi
      .fn()
      .mockRejectedValue(new Error("Discord send failed"));
    bot.postDeathLogToChannel = vi.fn().mockResolvedValue(undefined);

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
