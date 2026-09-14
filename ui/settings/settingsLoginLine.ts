import type { CachedAuthSessionPayload } from "../../auth/lastAuthSessionCache";
import type { AppStringKey } from "../../locales/appStrings";

export type SettingsLoginLine = {
  key: AppStringKey;
  vars: Record<string, string>;
};

function stripAt(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

function looksLikeEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

/**
 * Build the Settings “logged in via …” line from session identity fields.
 * Prefer provider + email / Telegram @handle over the synthetic `email_<hash>` username.
 */
export function resolveSettingsLoginLine(input: {
  session: CachedAuthSessionPayload | null;
  /** Fallback account key from Telegram context when session cache is cold. */
  accountUsername?: string | null;
}): SettingsLoginLine | null {
  const session = input.session?.authenticated ? input.session : null;
  const accountUsername = stripAt(
    session?.telegram_username ?? input.accountUsername ?? "",
  );
  if (!accountUsername && !session?.email && !session?.provider_username) {
    return null;
  }

  let provider = (session?.auth_provider ?? "").trim().toLowerCase();
  if (!provider) {
    provider = accountUsername.startsWith("email_") ? "email" : "telegram";
  } else if (provider === "telegram" && accountUsername.startsWith("email_")) {
    provider = "email";
  }

  const email =
    (typeof session?.email === "string" && session.email.trim()) ||
    (typeof session?.provider_username === "string" &&
    looksLikeEmail(session.provider_username)
      ? session.provider_username.trim()
      : "") ||
    "";

  const telegramHandle = stripAt(
    session?.telegram_username_actual ||
      (!accountUsername.startsWith("email_") ? accountUsername : "") ||
      "",
  );

  const githubHandle = stripAt(session?.provider_username ?? "");

  if (provider === "email") {
    if (email) return { key: "settings.loggedInViaEmail", vars: { email } };
    return { key: "settings.loggedInViaEmailGeneric", vars: {} };
  }

  if (provider === "google") {
    const identity = email || githubHandle || accountUsername;
    if (!identity) return null;
    return { key: "settings.loggedInViaGoogle", vars: { identity } };
  }

  if (provider === "apple") {
    const identity = email || githubHandle || accountUsername;
    if (!identity) return null;
    return { key: "settings.loggedInViaApple", vars: { identity } };
  }

  if (provider === "github") {
    const identity = githubHandle
      ? looksLikeEmail(githubHandle)
        ? githubHandle
        : `@${githubHandle}`
      : email || accountUsername;
    if (!identity) return null;
    return { key: "settings.loggedInViaGithub", vars: { identity } };
  }

  if (provider === "telegram") {
    if (!telegramHandle) return null;
    return { key: "settings.loggedInViaTelegram", vars: { username: telegramHandle } };
  }

  const identity = email || (telegramHandle ? `@${telegramHandle}` : accountUsername);
  if (!identity) return null;
  return {
    key: "settings.loggedInViaOther",
    vars: { provider, identity },
  };
}
