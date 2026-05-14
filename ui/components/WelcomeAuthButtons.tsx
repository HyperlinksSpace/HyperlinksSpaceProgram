import { Alert, Pressable, StyleSheet, Text, TextInput, View, Platform } from "react-native";
import { useState } from "react";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { buildApiUrl } from "../../api/_base";
import {
  useColors,
  typographyRect15,
  uiIconButtonVerticalCompensationY,
  uiTextVerticalCompensationTransform,
  uiWelcomeAppleOAuthIconExtraCompensationPx,
  welcomeAuthButtonHoverBackground,
  welcomeAuthButtonActiveBackground,
} from "../theme";
import { useAppStrings } from "../../locales/AppStringsContext";
import type { AppStringKey } from "../../locales/appStrings";
import { WelcomeAppPreviews } from "./WelcomeAppPreviews";
import { useTelegram } from "./Telegram";
import { isActuallyInTelegram } from "./telegramWebApp";

const BUTTON_HEIGHT = 40;
/** Same line box as {@link typographyRect15} — used to pad the email field like a flex-centered label row. */
const EMAIL_ROW_LINE_HEIGHT = 18;
const BUTTON_GAP = 20;
export const WELCOME_AUTH_MAX_WIDTH = 360;
const BUTTON_H_PADDING = 20;
const ICON_SIZE = 16;
const ICON_GAP = 10;
const GAP_BEFORE_EMAIL_BLOCK = 20;
const EMAIL_LABEL_TO_INPUT_GAP = 10;
const INPUT_TO_EMAIL_BUTTON_GAP = 20;
const INPUT_TO_EMAIL_BUTTON_GAP_WITH_ERROR = 10;
const EMAIL_ERROR_LINE_HEIGHT = 30;
const EMAIL_INVALID_COLOR = "#FF0000";
/** Text inset from the left inside the field (per design: 110px). */
const EMAIL_INPUT_TEXT_INSET_LEFT = 10;

const ICONS = {
  google: {
    black: require("../../assets/networks/black/Google.svg"),
    white: require("../../assets/networks/white/Google.svg"),
  },
  github: {
    black: require("../../assets/networks/black/GitHub.svg"),
    white: require("../../assets/networks/white/GitHub.svg"),
  },
  apple: {
    black: require("../../assets/networks/black/Apple.svg"),
    white: require("../../assets/networks/white/Apple.svg"),
  },
  telegram: {
    black: require("../../assets/networks/black/Telegram.svg"),
    white: require("../../assets/networks/white/Telegram.svg"),
  },
} as const;

const ROWS: { id: keyof typeof ICONS; labelKey: AppStringKey }[] = [
  { id: "google", labelKey: "welcome.auth.signInGoogle" },
  { id: "github", labelKey: "welcome.auth.signInGithub" },
  { id: "apple", labelKey: "welcome.auth.signInApple" },
  { id: "telegram", labelKey: "welcome.auth.signInTelegram" },
];

/**
 * Stacked auth provider rows: label + icon (reference: assets/networks/auth.png).
 * Light theme → black icons on `undercover`; dark → white icons.
 *
 * Row is `justifyContent: "center"` with [text, icon]. If an icon is slow or fails to render,
 * only the text measures — the label stays centered in the full button. When the icon appears,
 * the centered group may shift slightly (acceptable tradeoff).
 */
function isValidBasicEmail(value: string): boolean {
  const email = value.trim();
  // Basic structure only: local@domain.zone (no provider allow-list).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function WelcomeAuthButtons() {
  const router = useRouter();
  const { signIn } = useAuth();
  const colors = useColors();
  const { t } = useAppStrings();
  const { colorScheme, isInTelegram, triggerHaptic } = useTelegram();
  const [telegramBrowserPending, setTelegramBrowserPending] = useState(false);
  const [email, setEmail] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  /** Web hover: RN `Pressable` style state has no `hovered` in typings; use hover events (see theme hover helpers). */
  const [hoverOAuthId, setHoverOAuthId] = useState<(typeof ROWS)[number]["id"] | null>(null);
  const [hoverEmailSignIn, setHoverEmailSignIn] = useState(false);
  const useBlackIcons = colorScheme === "light";

  /**
   * Telegram Login / OIDC via `/api/auth/telegram/start` whenever we are **not** in a real Mini App
   * session (`isActuallyInTelegram`). Includes normal browsers **and** Windows/Electron (or other
   * `Platform.OS` values) where `window.location.assign` may be absent — then {@link Linking.openURL}
   * opens the system browser.
   *
   * Do not gate on `Platform.OS === "web"` alone: desktop shells report other OS values and would
   * otherwise fall through to `Alert` only (often invisible / no-op).
   */
  const useTelegramWebAuthOutsideMiniApp =
    typeof globalThis !== "undefined" &&
    typeof globalThis.fetch === "function" &&
    !isActuallyInTelegram();

  const onProviderPress = async (id: (typeof ROWS)[number]["id"]) => {
    if (id === "telegram") {
      if (useTelegramWebAuthOutsideMiniApp) {
        try {
          setTelegramBrowserPending(true);
          const response = await fetch(buildApiUrl("/api/auth/telegram/start"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "welcome",
            }),
          });
          const json = (await response.json().catch(() => ({}))) as { authUrl?: string; error?: string };
          if (!response.ok || !json?.authUrl) {
            throw new Error(json?.error || `HTTP_${response.status}`);
          }
          const authUrl = json.authUrl;
          if (
            typeof window !== "undefined" &&
            typeof window.location?.assign === "function" &&
            typeof window.location?.href === "string"
          ) {
            window.location.assign(authUrl);
          } else {
            await Linking.openURL(authUrl);
          }
          return;
        } catch (error) {
          console.error("[welcome] telegram browser auth start failed", error);
          Alert.alert(t("welcome.auth.telegramBrowserAlertTitle"), t("welcome.auth.telegramStartError"));
        } finally {
          setTelegramBrowserPending(false);
        }
        return;
      }
      if (!isInTelegram) {
        Alert.alert(
          t("welcome.auth.telegramBrowserAlertTitle"),
          t("welcome.auth.telegramBrowserAlertMessage"),
        );
        return;
      }
      // Web / TMA: any Telegram haptic (sync or deferred) can desync react-native-web’s touch bank on
      // tdesktop. Native keeps haptics; web skips.
      if (Platform.OS !== "web") {
        triggerHaptic("light");
      }
      signIn();
      router.replace("/");
      return;
    }
    /* wired when auth flows land */
  };

  return (
    <View style={styles.column}>
      {ROWS.map((row, index) => {
        const src = useBlackIcons ? ICONS[row.id].black : ICONS[row.id].white;
        const label = t(row.labelKey);
        return (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onProviderPress(row.id)}
            onHoverIn={
              Platform.OS === "web"
                ? () => {
                    setHoverOAuthId(row.id);
                  }
                : undefined
            }
            onHoverOut={
              Platform.OS === "web"
                ? () => {
                    setHoverOAuthId((cur) => (cur === row.id ? null : cur));
                  }
                : undefined
            }
            style={({ pressed }) => {
              const webHover = Platform.OS === "web" && hoverOAuthId === row.id;
              let backgroundColor = colors.undercover;
              if (pressed) {
                backgroundColor = welcomeAuthButtonActiveBackground(colors, colorScheme);
              } else if (webHover) {
                backgroundColor = welcomeAuthButtonHoverBackground(colors, colorScheme);
              }
              return [
                styles.button,
                {
                  backgroundColor,
                  marginTop: index === 0 ? 0 : BUTTON_GAP,
                  opacity:
                    row.id === "telegram" && telegramBrowserPending ? 0.6 : pressed ? 0.92 : 1,
                },
              ];
            }}
          >
            <Text style={[styles.label, { color: colors.primary }]} numberOfLines={1}>
              {label}
            </Text>
            <Image
              source={src}
              style={[
                styles.iconDims,
                {
                  transform: [
                    {
                      translateY:
                        uiIconButtonVerticalCompensationY -
                        (row.id === "apple" ? uiWelcomeAppleOAuthIconExtraCompensationPx : 0),
                    },
                  ],
                },
              ]}
              contentFit="contain"
            />
          </Pressable>
        );
      })}
      <View style={[styles.emailBlock, { marginTop: GAP_BEFORE_EMAIL_BLOCK }]}>
        <Text style={[styles.emailTitle, { color: colors.primary }]}>{t("welcome.auth.signInEmailTitle")}</Text>
        <View
          style={[
            styles.emailInputShell,
            {
              backgroundColor: colors.undercover,
              borderColor: colors.accent,
              marginTop: EMAIL_LABEL_TO_INPUT_GAP,
              ...(Platform.OS === "web"
                ? ({
                    "--welcome-email-autofill-bg": colors.undercover,
                    "--welcome-email-autofill-fg": colors.primary,
                  } as Record<string, string>)
                : {}),
            },
          ]}
        >
          <TextInput
            {...(Platform.OS === "web" ? { id: "welcome-email-input" } : {})}
            style={[styles.emailInputInner, { color: colors.primary }]}
            placeholder={t("welcome.auth.emailPlaceholder")}
            placeholderTextColor={colors.secondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (emailInvalid) setEmailInvalid(false);
            }}
          />
        </View>
        {emailInvalid ? (
          <Text style={[styles.emailInvalidText, { color: EMAIL_INVALID_COLOR }]}>{t("welcome.auth.emailInvalid")}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          onPress={() => {
            if (!isValidBasicEmail(email)) {
              setEmailInvalid(true);
              return;
            }
            setEmailInvalid(false);
            /* wired when auth flows land */
          }}
          onHoverIn={Platform.OS === "web" ? () => setHoverEmailSignIn(true) : undefined}
          onHoverOut={Platform.OS === "web" ? () => setHoverEmailSignIn(false) : undefined}
          style={({ pressed }) => {
            const webHover = Platform.OS === "web" && hoverEmailSignIn;
            let backgroundColor = colors.undercover;
            if (pressed) {
              backgroundColor = welcomeAuthButtonActiveBackground(colors, colorScheme);
            } else if (webHover) {
              backgroundColor = welcomeAuthButtonHoverBackground(colors, colorScheme);
            }
            return [
              styles.emailSignInButton,
              {
                backgroundColor,
                marginTop: emailInvalid
                  ? INPUT_TO_EMAIL_BUTTON_GAP_WITH_ERROR
                  : INPUT_TO_EMAIL_BUTTON_GAP,
                opacity: pressed ? 0.92 : 1,
              },
            ];
          }}
        >
          <Text style={[styles.label, { color: colors.primary }]}>{t("welcome.auth.signInButton")}</Text>
        </Pressable>
      </View>
      <WelcomeAppPreviews />
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: "100%",
    maxWidth: WELCOME_AUTH_MAX_WIDTH,
    alignItems: "center",
  },
  button: {
    width: "100%",
    maxWidth: WELCOME_AUTH_MAX_WIDTH,
    height: BUTTON_HEIGHT,
    paddingHorizontal: BUTTON_H_PADDING,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: ICON_GAP,
  },
  label: {
    ...typographyRect15,
    flexShrink: 1,
  },
  iconDims: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  emailBlock: {
    width: "100%",
    maxWidth: WELCOME_AUTH_MAX_WIDTH,
  },
  emailTitle: {
    fontSize: 15,
    lineHeight: 30,
    fontWeight: "400",
  },
  /**
   * Single undercover strip + one border. TextInput fills it (no nested box / second border).
   */
  emailInputShell: {
    width: "100%",
    maxWidth: WELCOME_AUTH_MAX_WIDTH,
    height: BUTTON_HEIGHT,
    borderWidth: 1,
    borderStyle: "solid",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxSizing: "border-box",
        minHeight: BUTTON_HEIGHT,
        maxHeight: BUTTON_HEIGHT,
      },
      default: {},
    }),
  },
  emailInputInner: {
    ...typographyRect15,
    /** Same optical nudge as `Text` defaults (`ensureUiSansFontFamilyDefaults`); explicit so placeholder/value match “Sign in”. */
    ...uiTextVerticalCompensationTransform,
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minHeight: BUTTON_HEIGHT,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingLeft: EMAIL_INPUT_TEXT_INSET_LEFT,
    paddingRight: BUTTON_H_PADDING,
    margin: 0,
    ...Platform.select({
      web: {
        /** RN-web: vertically center single-line placeholder like a 18px label in a 40px row (provider / Sign in buttons). */
        paddingTop: (BUTTON_HEIGHT - EMAIL_ROW_LINE_HEIGHT) / 2,
        paddingBottom: (BUTTON_HEIGHT - EMAIL_ROW_LINE_HEIGHT) / 2,
        outlineWidth: 0,
        boxSizing: "border-box",
      },
      default: {
        paddingVertical: 0,
      },
    }),
  },
  emailInvalidText: {
    lineHeight: EMAIL_ERROR_LINE_HEIGHT,
    fontSize: 15,
    fontWeight: "400",
  },
  emailSignInButton: {
    width: "100%",
    maxWidth: WELCOME_AUTH_MAX_WIDTH,
    height: BUTTON_HEIGHT,
    paddingHorizontal: BUTTON_H_PADDING,
    alignItems: "center",
    justifyContent: "center",
  },
});
