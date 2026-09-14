import { createContext, useContext } from "react";

export type MessageChatNavigateApi = {
  /** Scroll the open chat to a message (Telegram reply-quote tap). */
  scrollToMessage: (messageId: number) => void;
};

const MessageChatNavigateContext = createContext<MessageChatNavigateApi | null>(null);

export const MessageChatNavigateProvider = MessageChatNavigateContext.Provider;

export function useMessageChatNavigate(): MessageChatNavigateApi | null {
  return useContext(MessageChatNavigateContext);
}
