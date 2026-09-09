import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import {
  listAiAgentChats,
  type AiAgentChatDto,
} from "../../../api/aiAgentChatsClient";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, useColors } from "../../theme";
import { FloatingDialogShell } from "../FloatingDialogShell";
import { FloatingDialogBody } from "../FloatingDialogBody";
import { FloatingDialogStickyHeader } from "../FloatingDialogStickyHeader";
import { resolveFloatingDialogInsets } from "../floatingDialogChrome";
import { resolveFloatingDialogDefaultSize } from "../floatingDialogGeometry";
import { FloatingDialogScrollChromeProvider } from "../floatingDialogScrollChrome";
import { HspScrollColumn } from "../HspScrollColumn";

export type AiAgentHistoryPick = {
  id: string;
  title: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenChat: (chat: AiAgentHistoryPick) => void;
};

function formatUpdatedAt(iso: string, localeTag: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat(localeTag, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function AiAgentHistoryDialog({ visible, onClose, onOpenChat }: Props) {
  const colors = useColors();
  const { t, locale } = useAppStrings();
  const font = Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [headerExtendPx, setHeaderExtendPx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<AiAgentChatDto[]>([]);

  const defaultSize = useMemo(
    () => resolveFloatingDialogDefaultSize(windowWidth, windowHeight, "modal"),
    [windowHeight, windowWidth],
  );
  const dialogInsets = resolveFloatingDialogInsets(windowHeight);
  const localeTag = locale === "ru" ? "ru-RU" : locale === "zh" ? "zh-CN" : "en-US";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAiAgentChats();
      if (!res.ok) {
        setChats([]);
        setError(res.error || t("ai.agents.historyLoadError"));
        return;
      }
      setChats(Array.isArray(res.chats) ? res.chats : []);
    } catch {
      setChats([]);
      setError(t("ai.agents.historyLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!visible) return;
    void load();
  }, [visible, load]);

  return (
    <FloatingDialogShell
      visible={visible}
      zIndex={12070}
      defaultSize={defaultSize}
      minSize={{ width: 340, height: 420 }}
      sizeStorageKey="hsp.aiHistory.size.v1"
      onRequestClose={onClose}
      testId="ai-history"
    >
      <FloatingDialogScrollChromeProvider headerExtendPx={headerExtendPx}>
        <FloatingDialogBody>
          <FloatingDialogStickyHeader
            insets={dialogInsets}
            onClose={onClose}
            closeLabel={t("common.close")}
            title={t("ai.agents.historyTitle")}
            subtitle={t("ai.agents.historySubtitle")}
            onHeightChange={setHeaderExtendPx}
          />

          <HspScrollColumn
            style={{ flex: 1, minHeight: 0 }}
            containOverscroll
            scrollbarRightInsetPx={2}
            scrollIndicatorOverlaySeam={false}
            indicatorColor={colors.scrollIndicator}
            contentContainerStyle={{
              paddingHorizontal: dialogInsets.padX,
              paddingTop: 8,
              paddingBottom: 20,
              gap: 0,
            }}
          >
            {loading ? (
              <View style={{ paddingVertical: 28, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}

            {!loading && error ? (
              <Text
                style={{
                  color: colors.secondary,
                  fontSize: 14,
                  lineHeight: 20,
                  fontFamily: font,
                  paddingVertical: 12,
                }}
              >
                {error}
              </Text>
            ) : null}

            {!loading && !error && chats.length === 0 ? (
              <Text
                style={{
                  color: colors.secondary,
                  fontSize: 14,
                  lineHeight: 20,
                  fontFamily: font,
                  paddingVertical: 12,
                }}
              >
                {t("ai.agents.historyEmpty")}
              </Text>
            ) : null}

            {!loading && !error
              ? chats.map((chat) => {
                  const title = chat.title?.trim() || t("ai.agents.newAgent");
                  const when = formatUpdatedAt(chat.updated_at, localeTag);
                  return (
                    <Pressable
                      key={chat.id}
                      accessibilityRole="button"
                      accessibilityLabel={title}
                      onPress={() => {
                        onOpenChat({ id: chat.id, title });
                        onClose();
                      }}
                      style={({ pressed }) => ({
                        borderWidth: 1,
                        borderColor: colors.highlight,
                        backgroundColor: pressed ? colors.undercover : "transparent",
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        marginBottom: 8,
                      })}
                    >
                      <Text
                        numberOfLines={2}
                        style={[
                          typographyRect15,
                          { color: colors.primary, fontFamily: font },
                        ]}
                      >
                        {title}
                      </Text>
                      {when ? (
                        <Text
                          style={{
                            color: colors.secondary,
                            fontSize: 12,
                            lineHeight: 16,
                            marginTop: 4,
                            fontFamily: font,
                          }}
                        >
                          {when}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })
              : null}
          </HspScrollColumn>
        </FloatingDialogBody>
      </FloatingDialogScrollChromeProvider>
    </FloatingDialogShell>
  );
}
