import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import type { ThemeColors } from "../../theme";
import { typographyRect15 } from "../../theme";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import type { MappedInlineKeyboardButton, MappedReplyMarkup } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_BORDER_RADIUS_PX,
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
} from "./messageChatLayout";
import { answerTelegramCallbackQuery } from "../../telegram/answerTelegramCallbackQuery";
import { openTelegramBotWebApp } from "../../telegram/openTelegramBotWebApp";
import { useMessageChatBotWebApp } from "./MessageChatBotWebAppContext";

type Props = {
  chatId: number;
  messageId: number;
  botUserId?: number | null;
  markup: MappedReplyMarkup;
  colors: ThemeColors;
  maxWidthPx: number;
};

function buttonKey(rowIndex: number, colIndex: number, button: MappedInlineKeyboardButton): string {
  return `${rowIndex}:${colIndex}:${button.text}:${button.type.kind}`;
}

export function MessageChatInlineKeyboard({
  chatId,
  messageId,
  botUserId,
  markup,
  colors,
  maxWidthPx,
}: Props) {
  const webApp = useMessageChatBotWebApp();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setToast(trimmed);
    setTimeout(() => setToast((prev) => (prev === trimmed ? null : prev)), 3200);
  }, []);

  const onPressButton = useCallback(
    async (rowIndex: number, colIndex: number, button: MappedInlineKeyboardButton) => {
      const key = buttonKey(rowIndex, colIndex, button);
      if (busyKey) return;
      setBusyKey(key);
      try {
        const type = button.type;
        if (type.kind === "url" || type.kind === "login_url") {
          const url = type.url.trim();
          if (url) await Linking.openURL(url);
          return;
        }
        if (type.kind === "copy_text") {
          const text = type.text;
          if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            showToast("Copied");
          }
          return;
        }
        if (type.kind === "web_app") {
          const result = await openTelegramBotWebApp({
            chatId,
            botUserId: botUserId ?? null,
            url: type.url,
            messageId,
            source: "inline_button",
          });
          if (result.ok) {
            webApp?.open({
              url: result.url,
              title: button.text,
              launchId: result.launch_id,
            });
          } else {
            showToast(result.error || "Failed to open app");
          }
          return;
        }
        if (type.kind === "callback" || type.kind === "callback_game") {
          const result = await answerTelegramCallbackQuery({
            chatId,
            messageId,
            data: type.kind === "callback" ? type.data : "",
            game: type.kind === "callback_game",
          });
          if (!result.ok) {
            showToast(result.error || "Button failed");
            return;
          }
          if (result.url) {
            const open = await openTelegramBotWebApp({
              chatId,
              botUserId: botUserId ?? null,
              url: result.url,
              messageId,
              source: "callback_url",
            });
            if (open.ok) {
              webApp?.open({
                url: open.url,
                title: button.text,
                launchId: open.launch_id,
              });
            } else if (result.url.startsWith("http")) {
              await Linking.openURL(result.url);
            }
          }
          if (result.text) {
            if (result.show_alert && Platform.OS === "web" && typeof window !== "undefined") {
              window.alert(result.text);
            } else {
              showToast(result.text);
            }
          }
          return;
        }
        if (type.kind === "switch_inline") {
          showToast("Inline query not supported yet");
          return;
        }
        showToast("Unsupported button");
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, botUserId, chatId, messageId, showToast, webApp],
  );

  if (markup.kind !== "inline" || markup.rows.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 4,
        maxWidth: maxWidthPx,
        width: "100%",
        gap: 4,
      }}
    >
      {markup.rows.map((row, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={{
            flexDirection: "row",
            gap: 4,
            width: "100%",
          }}
        >
          {row.map((button, colIndex) => {
            const key = buttonKey(rowIndex, colIndex, button);
            const busy = busyKey === key;
            const isWebApp = button.type.kind === "web_app";
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={button.text}
                disabled={Boolean(busyKey)}
                onPress={() => void onPressButton(rowIndex, colIndex, button)}
                style={({ pressed }) => ({
                  flex: 1,
                  minWidth: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 8,
                  borderRadius: Math.min(10, MESSAGE_BUBBLE_BORDER_RADIUS_PX),
                  backgroundColor: colors.undercover,
                  borderWidth: Platform.OS === "web" ? 1 : 0.5,
                  borderColor: colors.highlight,
                  opacity: busyKey && !busy ? 0.55 : pressed ? 0.75 : 1,
                  ...(Platform.OS === "web"
                    ? ({ cursor: "pointer", userSelect: "none" } as object)
                    : null),
                })}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text
                    numberOfLines={2}
                    style={[
                      typographyRect15,
                      {
                        color: colors.primary,
                        fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
                        fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
                        lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
                        textAlign: "center",
                      },
                    ]}
                  >
                    {isWebApp ? `↗ ${button.text}` : button.text}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      {toast ? (
        <Text
          style={[
            typographyRect15,
            {
              color: colors.secondary,
              fontSize: 12,
              lineHeight: 16,
              marginTop: 2,
              textAlign: "center",
            },
          ]}
        >
          {toast}
        </Text>
      ) : null}
    </View>
  );
}
