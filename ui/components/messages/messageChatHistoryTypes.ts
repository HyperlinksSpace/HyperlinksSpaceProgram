export type MessageChatHistoryItem = {
  telegram_message_id: number;
  text: string;
  sent_at: string;
  sender_name: string;
  sender_user_id: number | null;
  is_outgoing: boolean;
};
