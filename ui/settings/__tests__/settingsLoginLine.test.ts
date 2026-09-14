import { resolveSettingsLoginLine } from "../settingsLoginLine";

describe("resolveSettingsLoginLine", () => {
  it("shows email address for email auth", () => {
    expect(
      resolveSettingsLoginLine({
        session: {
          authenticated: true,
          telegram_username: "email_ea9203dce6dc40a62670f837",
          auth_provider: "email",
          email: "user@example.com",
          fetchedAt: Date.now(),
        },
      }),
    ).toEqual({
      key: "settings.loggedInViaEmail",
      vars: { email: "user@example.com" },
    });
  });

  it("does not pretend email_* accounts are Telegram", () => {
    expect(
      resolveSettingsLoginLine({
        session: null,
        accountUsername: "email_ea9203dce6dc40a62670f837",
      }),
    ).toEqual({
      key: "settings.loggedInViaEmailGeneric",
      vars: {},
    });
  });

  it("shows Telegram @username for telegram auth", () => {
    expect(
      resolveSettingsLoginLine({
        session: {
          authenticated: true,
          telegram_username: "seva",
          auth_provider: "telegram",
          telegram_username_actual: "seva",
          fetchedAt: Date.now(),
        },
      }),
    ).toEqual({
      key: "settings.loggedInViaTelegram",
      vars: { username: "seva" },
    });
  });
});
