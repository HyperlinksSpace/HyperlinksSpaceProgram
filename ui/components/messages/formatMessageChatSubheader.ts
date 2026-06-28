import { formatAppString, type AppLocale } from "../../../locales/appStrings";
import { formatMessageChatPresenceLabel } from "./formatMessageChatPresence";
import type { MessageChatRowData } from "./MessageChatRow";
import { specialUserDisplayName } from "./specialTelegramUserDisplay";

function isChatActionLive(chat: MessageChatRowData): boolean {
  if (!chat.chat_action) return false;
  if (!chat.chat_action_expires_at) return true;
  return Date.parse(chat.chat_action_expires_at) > Date.now();
}

export function isMessageChatActionLive(chat: MessageChatRowData): boolean {
  return isChatActionLive(chat);
}

function chatActionActorName(chat: MessageChatRowData): string {
  const fromAction = chat.chat_action_user_name?.trim();
  if (fromAction) return fromAction;
  if (chat.chat_action_user_id != null && chat.chat_action_user_id === chat.peer_user_id) {
    return specialUserDisplayName(chat.peer_user_id, chat.title);
  }
  return "";
}

function formatChatActionLabel(chat: MessageChatRowData, locale: AppLocale): string {
  const action = chat.chat_action!;
  const peerName = specialUserDisplayName(chat.peer_user_id, chat.title);
  const actorName = chatActionActorName(chat);
  const isPrivatePeerAction =
    chat.peer_user_id != null && chat.chat_action_user_id === chat.peer_user_id;

  if (action === "typing") {
    if (isPrivatePeerAction || !actorName) {
      return formatAppString(locale, "messages.chatAction.typing");
    }
    return formatAppString(locale, "messages.chatAction.typingNamed", { name: actorName });
  }
  if (action === "recording_voice") {
    if (isPrivatePeerAction || !actorName) {
      return formatAppString(locale, "messages.chatAction.recordingVoice");
    }
    return formatAppString(locale, "messages.chatAction.recordingVoiceNamed", { name: actorName });
  }
  if (action === "recording_video") {
    if (isPrivatePeerAction || !actorName) {
      return formatAppString(locale, "messages.chatAction.recordingVideo");
    }
    return formatAppString(locale, "messages.chatAction.recordingVideoNamed", { name: actorName });
  }
  if (action === "uploading_photo") {
    if (isPrivatePeerAction || !actorName) {
      return formatAppString(locale, "messages.chatAction.uploadingPhoto");
    }
    return formatAppString(locale, "messages.chatAction.uploadingPhotoNamed", { name: actorName });
  }
  if (action === "uploading_video") {
    if (isPrivatePeerAction || !actorName) {
      return formatAppString(locale, "messages.chatAction.uploadingVideo");
    }
    return formatAppString(locale, "messages.chatAction.uploadingVideoNamed", { name: actorName });
  }
  if (action === "uploading_file") {
    if (isPrivatePeerAction || !actorName) {
      return formatAppString(locale, "messages.chatAction.uploadingFile");
    }
    return formatAppString(locale, "messages.chatAction.uploadingFileNamed", { name: actorName });
  }

  if (!actorName) return formatAppString(locale, "messages.chatAction.typing");
  return formatAppString(locale, "messages.chatAction.typingNamed", { name: actorName || peerName });
}

/** Header subheader: live chat action overrides presence / last seen. */
export function formatMessageChatSubheaderLabel(chat: MessageChatRowData, locale: AppLocale): string {
  if (isChatActionLive(chat)) {
    return formatChatActionLabel(chat, locale);
  }
  return formatMessageChatPresenceLabel(chat, locale);
}

/** Chat list preview line: typing/recording overrides last message snippet. */
export function formatMessageChatListSubtitle(chat: MessageChatRowData, locale: AppLocale): string {
  if (isChatActionLive(chat)) {
    return formatChatActionLabel(chat, locale);
  }
  return chat.subtitle.trim();
}
