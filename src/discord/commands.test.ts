import { describe, expect, it } from "vitest";
import { commands } from "./commands.js";

describe("Discord commands", () => {
  it("keeps all user actions on the panel", () => {
    expect(commands.map((command) => command.name)).toEqual(["marimo-admin"]);
  });
});
