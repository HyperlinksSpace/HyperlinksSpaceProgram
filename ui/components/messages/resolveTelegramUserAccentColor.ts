import type { ThemeName } from "../../theme";
import { resolveTelegramUserAccentColor as resolveShared } from "../../../shared/telegramUserAccentColor";

export function resolveTelegramUserAccentColor(
  accentLight: string | null | undefined,
  accentDark: string | null | undefined,
  scheme: ThemeName,
): string | null {
  return resolveShared(
    {
      light: accentLight ?? null,
      dark: accentDark ?? null,
    },
    scheme === "dark" ? "dark" : "light",
  );
}
