import { Platform, Pressable, Text, View } from "react-native";
import { typographyRect15, useColors } from "../../theme";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import type { MessageChatBotWebAppSession } from "./MessageChatBotWebAppContext";

type Props = {
  session: MessageChatBotWebAppSession | null;
  onClose: () => void;
};

/**
 * In-app Telegram Mini App host — mirrors Telegram Web's webview sheet:
 * top chrome with title + close, iframe body for the bot Web App URL.
 */
export function MessageChatBotWebAppSheet({ session, onClose }: Props) {
  const colors = useColors();
  if (!session) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: Platform.OS === "web" ? ("fixed" as unknown as "absolute") : "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 12000,
        backgroundColor: "rgba(0,0,0,0.45)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 480,
          height: "90%",
          maxHeight: 820,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.highlight,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.highlight,
            backgroundColor: colors.undercover,
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              typographyRect15,
              {
                flex: 1,
                color: colors.primary,
                fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
                fontWeight: "600",
                marginRight: 12,
              },
            ]}
          >
            {session.title || "Mini App"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close mini app"
            onPress={onClose}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              opacity: pressed ? 0.7 : 1,
              backgroundColor: colors.background,
            })}
          >
            <Text style={[typographyRect15, { color: colors.primary }]}>Close</Text>
          </Pressable>
        </View>
        {Platform.OS === "web" ? (
          <iframe
            title={session.title || "Telegram Mini App"}
            src={session.url}
            style={{
              border: "none",
              width: "100%",
              height: "100%",
              flex: 1,
              background: colors.background,
            }}
            allow="camera; microphone; geolocation; clipboard-read; clipboard-write; payment"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={[typographyRect15, { color: colors.secondary, textAlign: "center" }]}>
              Mini Apps open in the browser version of this app.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
