import { useMemo } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { useColors } from "../../theme";
import { FloatingDialogShell } from "../FloatingDialogShell";
import { FloatingDialogStickyHeader } from "../FloatingDialogStickyHeader";
import { resolveFloatingDialogInsets } from "../floatingDialogChrome";
import { HspScrollColumn } from "../HspScrollColumn";
import { SCROLL_INDICATOR_OVERLAY_CHROME_BORDER_INSET_PX } from "../../scrollIndicatorPx";
import type { MessageChatRowData } from "./MessageChatRow";
import {
  MESSAGE_FONT_SIZE_PX,
  MESSAGE_LINE_HEIGHT_PX,
} from "./messageListLayout";

type Props = {
  visible: boolean;
  chats: MessageChatRowData[];
  onClose: () => void;
  onPick: (chat: MessageChatRowData) => void;
};

/** Compact chat picker for playlist "Forward" (Telegram Desktop style). */
export function MessageChatProfilePlaylistForwardSheet({
  visible,
  chats,
  onClose,
  onPick,
}: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const insets = resolveFloatingDialogInsets(typeof window !== "undefined" ? window.innerHeight : 800);
  const rows = useMemo(
    () => chats.filter((row) => Number.isFinite(row.telegram_chat_id) && row.telegram_chat_id !== 0),
    [chats],
  );

  return (
    <FloatingDialogShell
      visible={visible}
      zIndex={10250}
      defaultSize={{ width: 360, height: 420 }}
      minSize={{ width: 280, height: 280 }}
      sizeStorageKey="hsp.profilePlaylistForward.size.v1"
      offsetStorageKey="hsp.profilePlaylistForward.offset.v1"
      onRequestClose={onClose}
      testId="profile-playlist-forward-sheet"
      moveIgnoreSelector="[data-floating-no-drag],button,[role='button']"
    >
      <View style={{ flex: 1, minHeight: 0, flexDirection: "column", overflow: "hidden" }}>
        <FloatingDialogStickyHeader
          insets={insets}
          title={t("messages.action.forward")}
          titleAlign="center"
          onClose={onClose}
          closeLabel={t("common.close")}
        />
        <HspScrollColumn
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{
            paddingTop: insets.bodyPadTop,
            paddingHorizontal: 16,
            paddingBottom: insets.bodyPadBottom,
          }}
          scrollbarRightInsetPx={SCROLL_INDICATOR_OVERLAY_CHROME_BORDER_INSET_PX}
          scrollIndicatorOverlaySeam={false}
          containOverscroll
        >
          {rows.length === 0 ? (
            <Text
              style={{
                fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
                fontSize: MESSAGE_FONT_SIZE_PX,
                lineHeight: MESSAGE_LINE_HEIGHT_PX,
                color: colors.secondary,
                paddingTop: 8,
              }}
            >
              {t("messages.profile.playlistEmpty")}
            </Text>
          ) : (
            rows.map((chat) => (
              <Pressable
                key={chat.telegram_chat_id}
                accessibilityRole="button"
                onPress={() => onPick(chat)}
                style={({ pressed }) => ({
                  paddingVertical: 10,
                  opacity: pressed ? 0.7 : 1,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.highlight,
                })}
                {...(Platform.OS === "web"
                  ? ({ "data-floating-no-drag": "1" } as object)
                  : {})}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
                    fontSize: MESSAGE_FONT_SIZE_PX,
                    lineHeight: MESSAGE_LINE_HEIGHT_PX,
                    color: colors.primary,
                  }}
                >
                  {chat.title || chat.peer_username || `Chat ${chat.telegram_chat_id}`}
                </Text>
              </Pressable>
            ))
          )}
        </HspScrollColumn>
      </View>
    </FloatingDialogShell>
  );
}
