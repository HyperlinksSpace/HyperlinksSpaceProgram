import { Alert, Pressable, StyleSheet, Text, TextInput, View, Platform } from "react-native";
import { useState } from "react";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { buildApiUrl } from "../../api/_base";
import { useColors } from "../theme";
import { WelcomeAppPreviews } from "./WelcomeAppPreviews";
import { useTelegram } from "./Telegram";
import { isActuallyInTelegram } from "./telegramWebApp";

const BUTTON_HEIGHT = 40;
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
const EMAIL_INPUT_FONT_SIZE = 15;

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

const ROWS: { id: keyof typeof ICONS; label: string }[] = [
  { id: "google", label: "Sign in with Google" },
  { id: "github", label: "Sign in with GitHub" },
  { id: "apple", label: "Sign in with Apple" },
  { id: "telegram", label: "Sign in with Telegram" },
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
  const { colorScheme, isInTelegram, triggerHaptic } = useTelegram();
  const [telegramBrowserPending, setTelegramBrowserPending] = useState(false);
  const [email, setEmail] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const useBlackIcons = colorScheme === "light";

  /**
   * Browser OIDC (`/api/auth/telegram/start`) when not in a **real** Mini App session.
   * Do not use `isTelegramMiniAppEnvironment()` here: it is true whenever `Telegram.WebApp`
   * exists (e.g. script on localhost), which wrongly disabled OIDC and caused a silent no-op
   * (`!isInTelegram` return) in normal browsers.
   */
  const useTelegramBrowserOidc =
    Platform.OS === "web" && typeof window !== "undefined" && !isActuallyInTelegram();

  const onProviderPress = async (id: (typeof ROWS)[number]["id"]) => {
    if (id === "telegram") {
      if (useTelegramBrowserOidc) {
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
          window.location.assign(json.authUrl);
          return;
        } catch (error) {
          console.error("[welcome] telegram browser auth start failed", error);
        } finally {
          setTelegramBrowserPending(false);
        }
        return;
      }
      if (!isInTelegram) {
        Alert.alert(
          "Sign in with Telegram",
          "Open this page inside the Telegram app to continue, or use a normal web browser (not an in-app preview that mimics Telegram).",
        );
        return;
      }
      triggerHaptic("light");
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
        return (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            onPress={() => onProviderPress(row.id)}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: colors.undercover,
                marginTop: index === 0 ? 0 : BUTTON_GAP,
                opacity:
                  row.id === "telegram" && telegramBrowserPending
                    ? 0.6
                    : pressed
                      ? 0.85
                      : 1,
              },
            ]}
          >
            <Text style={[styles.label, { color: colors.primary }]} numberOfLines={1}>
              {row.label}
            </Text>
            <Image source={src} style={styles.icon} contentFit="contain" />
          </Pressable>
        );
      })}
      <View style={[styles.emailBlock, { marginTop: GAP_BEFORE_EMAIL_BLOCK }]}>
        <Text style={[styles.emailTitle, { color: colors.primary }]}>Sign in with email</Text>
        <View
          style={[
            styles.emailInputShell,
            {
              backgroundColor: colors.undercover,
              borderColor: colors.highlight,
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
            placeholder="Your email address"
            placeholderTextColor={colors.highlight}
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
          <Text style={[styles.emailInvalidText, { color: EMAIL_INVALID_COLOR }]}>Invalid email</Text>
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
          style={({ pressed }) => [
            styles.emailSignInButton,
            {
              backgroundColor: colors.undercover,
              marginTop: emailInvalid
                ? INPUT_TO_EMAIL_BUTTON_GAP_WITH_ERROR
                : INPUT_TO_EMAIL_BUTTON_GAP,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.label, { color: colors.primary }]}>Sign in</Text>
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
    fontSize: 15,
    fontWeight: "400",
    flexShrink: 1,
  },
  icon: {
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
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minHeight: BUTTON_HEIGHT,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingLeft: EMAIL_INPUT_TEXT_INSET_LEFT,
    paddingRight: BUTTON_H_PADDING,
    paddingVertical: 0,
    margin: 0,
    fontSize: EMAIL_INPUT_FONT_SIZE,
    lineHeight: EMAIL_INPUT_FONT_SIZE,
    fontWeight: "400",
    textAlignVertical: "center",
    includeFontPadding: false,
    ...Platform.select({
      web: {
        outlineWidth: 0,
        boxSizing: "border-box",
      },
      default: {},
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
