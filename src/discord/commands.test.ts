import { describe, expect, it } from "vitest";
import { commands } from "./commands.js";

describe("Discord commands", () => {
  it("keeps all user actions on the panel", () => {
    expect(commands.map((command) => command.name)).toEqual(["marimo-admin"]);
  });

  it("offers separate living and dead size leaderboards", () => {
    const commandJson = JSON.stringify(commands);

    expect(commandJson).toContain('"value":"size"');
    expect(commandJson).toContain('"value":"dead"');
    expect(commandJson).toContain("枯れたまりもランキング");
    expect(commandJson).not.toContain('"value":"age"');
    expect(commandJson).not.toContain("生存日数ランキング");
  });

  it("configures logging in the channel where the command runs", () => {
    const commandJson = JSON.stringify(commands);

    expect(commandJson).toContain(
      '"name":"log","description":"実行したチャンネルをまりもログと通知の投稿先に設定"'
    );
    expect(commandJson).not.toContain('"name":"channel"');
    expect(commandJson).toContain(
      '"name":"log-refresh","description":"まりも画像ログを全履歴から時系列で作り直す"'
    );
  });

  it("configures allowed roles with add, remove, and list subcommands", () => {
    const commandJson = JSON.stringify(commands);

    expect(commandJson).toContain(
      '"name":"role","description":"まりもBotを利用できるロールを設定"'
    );
    expect(commandJson).toContain(
      '"name":"add","description":"利用できるロールを追加"'
    );
    expect(commandJson).toContain(
      '"name":"remove","description":"利用できるロールを削除"'
    );
    expect(commandJson).toContain(
      '"name":"list","description":"利用できるロールを確認"'
    );
  });
});
