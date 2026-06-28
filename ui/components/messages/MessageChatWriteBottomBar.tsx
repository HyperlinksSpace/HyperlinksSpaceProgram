import { useCallback, useRef, useState } from "react";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { useAuthenticatedHomeSelectedChat } from "../../authenticatedHomeSelectedChat";
import { publishOutgoingChatMessage } from "../../messageChatOutgoing";
import { sendTelegramChatMessage } from "../../telegram/sendTelegramChatMessage";
import { useTelegramMessagesConnection } from "../../telegram/TelegramMessagesConnectionContext";
import { GlobalBottomBar } from "../GlobalBottomBar";

/** Chat compose bar in wide three-column layout — same chrome as {@link GlobalBottomBar}. */
export function MessageChatWriteBottomBar() {
  const { t } = useAppStrings();
  const selectedChat = useAuthenticatedHomeSelectedChat();
  const { isTelegramMessagesConnected } = useTelegramMessagesConnection();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const onSubmit = useCallback(
    async (text: string) => {
      if (!selectedChat || !isTelegramMessagesConnected || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      try {
        const result = await sendTelegramChatMessage(selectedChat.telegram_chat_id, text);
        if (result.ok) {
          publishOutgoingChatMessage(selectedChat.telegram_chat_id, result.message);
        } else {
          console.warn("[message-send]", result.error, {
            chatId: selectedChat.telegram_chat_id,
          });
        }
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [isTelegramMessagesConnected, selectedChat],
  );

  const canSend = selectedChat != null && isTelegramMessagesConnected && !sending;

  return (
    <GlobalBottomBar
      placeholderText={t("messages.chatWrite.placeholder")}
      iconRotationDeg={-45}
      sendAccessibilityLabel={t("messages.chatWrite.send")}
      useLocalDraft
      onSubmit={canSend ? onSubmit : () => {}}
    />
  );
}
