import type { MessageChatHistoryItem } from "./components/messages/messageChatHistoryTypes";
import { invalidateChatHistoryCache } from "./messageChatHistoryCache";

export type OutgoingChatMessageEvent = {
  chatId: number;
  message: MessageChatHistoryItem;
};

const listeners = new Set<(event: OutgoingChatMessageEvent) => void>();

export function publishOutgoingChatMessage(chatId: number, message: MessageChatHistoryItem): void {
  invalidateChatHistoryCache(chatId);
  const event = { chatId, message };
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeOutgoingChatMessages(
  listener: (event: OutgoingChatMessageEvent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
