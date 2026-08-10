import { describe, expect, it } from "vitest";
import { commands } from "./commands.js";

describe("Discord commands", () => {
  it("keeps all user actions on the panel", () => {
    expect(commands.map((command) => command.name)).toEqual(["marimo-admin"]);
  });

  it("offers one combined size leaderboard", () => {
    const commandJson = JSON.stringify(commands);

    expect(commandJson).toContain('"value":"size"');
    expect(commandJson).not.toContain('"value":"age"');
    expect(commandJson).not.toContain("生存日数ランキング");
  });

  it("configures logging in the channel where the command runs", () => {
    const commandJson = JSON.stringify(commands);

    expect(commandJson).toContain(
      '"name":"log","description":"実行したチャンネルを画像ログの投稿先に設定"'
    );
    expect(commandJson).not.toContain('"name":"channel"');
  });
});
