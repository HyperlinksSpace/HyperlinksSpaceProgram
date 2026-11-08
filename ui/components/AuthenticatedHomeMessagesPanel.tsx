import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { buildApiUrl } from "../../api/_base";
import { normalizeFormattedTextSegments, type FormattedTextSegment } from "../../shared/formattedTextSegments";
import { isSavedMessagesPeer, savedMessagesQueryMatches } from "../../shared/savedMessages";
import { normalizeTelegramGroupCallId } from "../../shared/telegramGroupCallSdp";
import {
  normalizeTelegramProfilePhotoMarkup,
  telegramProfilePhotoMarkupEqual,
} from "../../shared/telegramProfilePhoto";
import { rememberTelegramProfilePhotoMarkup } from "../telegram/telegramProfilePhotoStore";
import {
  invalidateMessageChatAvatarCacheForChat,
} from "./messages/MessageChatAvatarImage";
import { useAuth } from "../../auth/AuthContext";
import { useAppStrings } from "../../locales/AppStringsContext";
import { useProfileSheet } from "../profile/ProfileContext";
import { logPageDisplay, firstChatListLogFields, chatLogFields } from "../pageDisplayLog";
import { layout, type ThemeColors } from "../theme";
import { useTelegramMessagesConnection } from "../telegram/TelegramMessagesConnectionContext";
import { reorderTelegramPinnedChats } from "../telegram/reorderTelegramPinnedChats";
import { toggleTelegramChatPinned } from "../telegram/toggleTelegramChatPinned";
import {
  clearAuthenticatedHomeSelectedChat,
  mergeChatRowVoicePreferClientClear,
  openAuthenticatedHomeChatHistory,
  resolveAuthenticatedHomeOpenChatUnread,
  subscribeChatVoiceMeta,
  syncAuthenticatedHomeSelectedChat,
  useAuthenticatedHomeMiddleColumnFocus,
  useAuthenticatedHomeSelectedChat,
} from "../authenticatedHomeSelectedChat";
import {
  readAuthenticatedHomeCompactChatLayoutSync,
  useAuthenticatedHomeCompactChatLayout,
} from "../authenticatedHomeLayoutWidth";
import {
  isAuthenticatedHomeCompactChatRoutePushIntent,
  maybePushAuthenticatedHomeCompactChatRoute,
} from "../navigateAuthenticatedHomeCompactChat";
import { useResolvedPathname } from "../useResolvedPathname";
import {
  isOpenChatFocusHoldActive,
  prefetchChatHistory,
  prefetchChatHistoryPriority,
  prefetchVisibleChatNeighbors,
  setOpenChatFocusHold,
} from "../messageChatHistoryPrefetch";
import { unlockVoiceAutoplay } from "../telegram/unlockVoiceAutoplay";
import { warmupTelegramChatSession } from "../telegram/warmupTelegramChatSession";
import { publishTelegramChatDirectory } from "../telegram/telegramChatDirectory";
import { openTelegramBotWebApp } from "../telegram/openTelegramBotWebApp";
import { useMessageChatBotWebApp } from "./messages/MessageChatBotWebAppContext";
import { getCachedChatHistory } from "../messageChatHistoryCache";
import {
  clearQueuedNormalNetworkFetches,
  demoteQueuedNetworkFetches,
} from "./messages/networkFetchQueue";
import { MessageChatRow, type MessageChatRowData, type MessageChatKind } from "./messages/MessageChatRow";
import { MessageChatListArchiveFolderRow } from "./messages/MessageChatListArchiveFolderRow";
import { MessageChatListCatalogLoadingRow } from "./messages/MessageChatListCatalogLoadingRow";
import { MessageChatListContextMenu } from "./messages/MessageChatListContextMenu";
import { useMessagesChatListSearch, markChatListSearchRowPressPending } from "../messages/MessagesChatListSearchContext";
import {
  getMessagesArchiveOpen,
  setMessagesArchiveOpen,
  useMessagesArchiveOpen,
} from "../messages/messagesArchiveOpen";
import { ChatListBottomSentinel } from "./messages/ChatListBottomSentinel";
import { ChatListTopSentinel } from "./messages/ChatListTopSentinel";
import { LIST_SCROLL_CATALOG_TAIL_LEAD_ROWS } from "../listScrollPageSize";
import { CHAT_LIST_API_PAGE_SIZE, useChatListViewport } from "../hooks/useChatListViewport";
import {
  beginChatListScrollPageFetch,
  rollbackChatListScrollFetchReservation,
  chatListScrollHasMore,
  endChatListScrollPageFetch,
  getChatListLoadedPages,
  isChatListScrollPageFetchInFlight,
  noteChatListPageLoaded,
  rankingRefreshOffsetForPage,
  rankingRefreshPageCount,
  repairChatListPaginationFromClient,
  chatListPaginationFullyLoaded,
  chatListScrollCatalogPartial,
  resetChatListScrollPagination,
  resolveChatListFetchOffset,
  syncChatListPaginationAfterFullLoad,
  chatListScrollPaginationGeneration,
} from "../telegram/chatListScrollPagination";
import {
  chatListGatewayLoadMoreAllowed,
  registerChatListScrollPageLoader,
  requestChatListCatalogNextPage,
} from "../telegram/chatListCatalogScroll";
import {
  getChatListSyncStatus,
  setChatListSyncStatus,
  type ChatListSyncStatus,
} from "./messages/chatListSyncStatus";
import { setTelegramTotalUnread } from "../messages/telegramUnreadStore";
import { setChatListBottomLoaderActive } from "./messages/chatListBottomLoaderStatus";
import { setChatListNearBottomHandler } from "./messages/chatListNearBottom";
import {
  resetChatListArchiveRevealLatch,
  setChatListNearTopHandler,
} from "./messages/chatListNearTop";
import {
  invokeChatListSearchScrollToEnd,
  setChatListSearchScrollToEndHandler,
} from "./messages/chatListSearchScrollAnchor";
import type { HspScrollAnchor } from "./HspScrollColumn";
import {
  captureChatListScrollPreserveAnchor,
  getChatListScrollMetrics,
  restoreChatListScrollPreserveAnchor,
  subscribeChatListScrollMetrics,
} from "./messages/chatListScrollMetrics";
import {
  CHAT_LIST_VIRTUALIZE_MIN_ROWS,
  chatListCatalogPhantomRowCount,
  chatListCatalogTailWithinPrefetch,
  resolveChatListTier,
  resolveChatListVirtualWindow,
  sortChatRowsTierAware,
} from "./messages/chatListVirtualWindow";
import {
  chatListRowStridePx,
  chatListShellTopInsetPx,
  homeListShellStyle,
  MESSAGE_ROW_HEIGHT_PX,
} from "./messages/messageListLayout";
import {
  isVoiceDialogUiOpen,
  subscribeVoiceDialogUiOpen,
} from "./messages/voiceDialogUiGate";
import { telegramEmojiDebug } from "./messages/telegramEmojiDebug";
import { useTelegramMessagesChatListStream } from "./messages/useTelegramMessagesChatListStream";
import { fetchTelegramChatListSearch, rememberTelegramFoundChat, clearTelegramRecentFoundChats, removeTelegramRecentFoundChat, type TelegramChatListSearchHit } from "../telegram/fetchTelegramChatListSearch";

function normalizeSearchNeedle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

function chatMatchesLocalSearch(row: MessageChatRowData, needle: string): boolean {
  if (!needle) return true;
  if (row.is_saved_messages && savedMessagesQueryMatches(needle)) return true;
  const fields = [
    row.title,
    row.subtitle,
    row.peer_username,
    row.chat_username,
  ];
  for (const field of fields) {
    if (typeof field !== "string" || !field.trim()) continue;
    if (normalizeSearchNeedle(field).includes(needle)) return true;
  }
  if (Array.isArray(row.subtitle_segments)) {
    for (const segment of row.subtitle_segments) {
      if (segment && typeof segment.text === "string" && segment.text.trim()) {
        if (normalizeSearchNeedle(segment.text).includes(needle)) return true;
      }
    }
  }
  return false;
}

function chatSearchRank(row: MessageChatRowData, needle: string, serverHit: boolean): number {
  if (!needle) return 0;
  // Telegram Desktop: Saved Messages is the first hit for "sav" / "Избранное" / "收藏".
  if (row.is_saved_messages && savedMessagesQueryMatches(needle)) return -1;
  const title = normalizeSearchNeedle(row.title || "");
  const peer = normalizeSearchNeedle(row.peer_username || "");
  const chatUser = normalizeSearchNeedle(row.chat_username || "");
  const subtitle = normalizeSearchNeedle(row.subtitle || "");
  // Prefer exact / prefix username matches (global @user / channel finds).
  if (peer === needle || chatUser === needle) return 0;
  if (peer.startsWith(needle) || chatUser.startsWith(needle)) return 1;
  if (title.startsWith(needle)) return 2;
  if (title.includes(needle)) return 3;
  if (peer.includes(needle) || chatUser.includes(needle)) return 4;
  if (subtitle.includes(needle)) return 5;
  if (serverHit) return 6;
  return 7;
}

/** Remote TDLib hits for chats not yet in the scroll-synced local window. */
function remoteSearchHitToRow(
  hit: TelegramChatListSearchHit,
  selfUserId?: number | null,
): MessageChatRowData {
  const username = (hit.peerUsername || hit.chatUsername || "").replace(/^@+/, "").trim();
  const kindLabel =
    hit.chatKind === "channel"
      ? "channel"
      : hit.chatKind === "supergroup" || hit.chatKind === "group"
        ? "group"
        : hit.chatKind === "private"
          ? "user"
          : "";
  const subtitleParts = [
    username ? `@${username}` : "",
    kindLabel,
  ].filter(Boolean);
  const isSaved = isSavedMessagesPeer(hit.peerUserId, selfUserId);
  return {
    id: hit.chatId,
    telegram_chat_id: hit.chatId,
    title: hit.title,
    subtitle: subtitleParts.join(" · "),
    avatar_url: null,
    last_message_at: null,
    unread_count: 0,
    peer_user_id: hit.peerUserId,
    peer_username: hit.peerUsername,
    chat_username: hit.chatUsername,
    chat_kind: hit.chatKind,
    list_tier: "positioned",
    has_active_voice_chat: Boolean(hit.has_active_voice_chat),
    voice_chat_is_joined: Boolean(hit.has_active_voice_chat && hit.voice_chat_is_joined),
    is_saved_messages: isSaved,
  };
}

/** Prefer the live chat-list row; keep search voice flags when the live row lags. */
function resolveSearchHitRow(
  hit: TelegramChatListSearchHit,
  liveById: Map<number, MessageChatRowData>,
  selfUserId?: number | null,
): MessageChatRowData {
  const live = liveById.get(hit.chatId);
  if (!live) return remoteSearchHitToRow(hit, selfUserId);
  const withSaved =
    live.is_saved_messages || isSavedMessagesPeer(live.peer_user_id, selfUserId)
      ? { ...live, is_saved_messages: true }
      : live;
  if (hit.has_active_voice_chat && !withSaved.has_active_voice_chat) {
    return {
      ...withSaved,
      has_active_voice_chat: true,
      voice_chat_is_joined: Boolean(hit.voice_chat_is_joined),
    };
  }
  return withSaved;
}

type ChatListDisplayItem =
  | { kind: "chat"; key: string; row: MessageChatRowData }
  | {
      kind: "archiveFolder";
      key: string;
      previewTitle: string | null;
      unreadCount: number;
      loading?: boolean;
    }
  | { kind: "sectionHeader"; key: string; sectionId: string; title: string }
  | { kind: "messagesFooter"; key: string; count: number }
  | { kind: "recentsFooter"; key: string }
  | { kind: "catalogLoading"; key: string };

/** Chevron: closed → right; open → up (column-reverse search scrolls upward). */
function SearchSectionChevron({ open, color }: { open: boolean; color: string }) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [open, progress]);
  // Right (0°) → up (−90°) when opening.
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-90deg"],
  });
  return (
    <Animated.View
      style={{
        width: 14,
        height: 14,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ rotate }],
      }}
    >
      <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <Path
          d="M5 2.5L9.5 7L5 11.5"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
}

type Props = {
  colors: ThemeColors;
  scrollable?: boolean;
};

function normalizeChatKind(raw: unknown): MessageChatKind | null {
  if (raw === "private" || raw === "group" || raw === "supergroup" || raw === "channel") {
    return raw;
  }
  return null;
}

function normalizeChat(raw: unknown): MessageChatRowData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  const telegramChatId = Number(row.telegram_chat_id);
  if (!Number.isFinite(id) || !Number.isFinite(telegramChatId)) return null;
  const title = typeof row.title === "string" ? row.title : "";
  const subtitle = typeof row.subtitle === "string" ? row.subtitle : "";
  const avatarUrl = typeof row.avatar_url === "string" ? row.avatar_url : null;
  const lastAt =
    typeof row.last_message_at === "string" || typeof row.last_message_at === "number"
      ? row.last_message_at
      : null;
  const unread = Number(row.unread_count);
  const peerUserId = Number(row.peer_user_id);
  const peerUsername =
    typeof row.peer_username === "string" && row.peer_username.trim()
      ? row.peer_username.trim().replace(/^@+/, "")
      : null;
  const chatUsername =
    typeof row.chat_username === "string" && row.chat_username.trim()
      ? row.chat_username.trim().replace(/^@+/, "")
      : null;
  const memberCount = Number(row.member_count);
  const presenceKindRaw = row.presence_kind;
  const presenceKind =
    presenceKindRaw === "online" ||
    presenceKindRaw === "recently" ||
    presenceKindRaw === "last_week" ||
    presenceKindRaw === "last_month" ||
    presenceKindRaw === "offline"
      ? presenceKindRaw
      : null;
  const presenceAt =
    typeof row.presence_at === "string" || typeof row.presence_at === "number"
      ? String(row.presence_at)
      : null;
  const chatActionRaw = row.chat_action;
  const chatAction =
    chatActionRaw === "typing" ||
    chatActionRaw === "recording_voice" ||
    chatActionRaw === "recording_video" ||
    chatActionRaw === "uploading_photo" ||
    chatActionRaw === "uploading_video" ||
    chatActionRaw === "uploading_file"
      ? chatActionRaw
      : null;
  const chatActionUserId = Number(row.chat_action_user_id);
  const chatActionUserName =
    typeof row.chat_action_user_name === "string" ? row.chat_action_user_name : null;
  const chatActionExpiresAt =
    typeof row.chat_action_expires_at === "string" || typeof row.chat_action_expires_at === "number"
      ? String(row.chat_action_expires_at)
      : null;
  return {
    id,
    telegram_chat_id: telegramChatId,
    title,
    subtitle,
    subtitle_segments: normalizeFormattedTextSegments(row.subtitle_segments),
    avatar_url: avatarUrl,
    last_message_at: lastAt == null ? null : String(lastAt),
    unread_count: Number.isFinite(unread) ? unread : 0,
    peer_user_id: Number.isFinite(peerUserId) ? peerUserId : null,
    peer_username: peerUsername,
    chat_username: chatUsername,
    chat_kind: normalizeChatKind(row.chat_kind),
    member_count: Number.isFinite(memberCount) && memberCount > 0 ? Math.trunc(memberCount) : null,
    peer_emoji_status_custom_emoji_id:
      typeof row.peer_emoji_status_custom_emoji_id === "string" &&
      row.peer_emoji_status_custom_emoji_id.trim()
        ? row.peer_emoji_status_custom_emoji_id.trim()
        : null,
    peer_accent_color_light:
      typeof row.peer_accent_color_light === "string" && row.peer_accent_color_light.trim()
        ? row.peer_accent_color_light.trim()
        : null,
    peer_accent_color_dark:
      typeof row.peer_accent_color_dark === "string" && row.peer_accent_color_dark.trim()
        ? row.peer_accent_color_dark.trim()
        : null,
    presence_kind: presenceKind,
    presence_at: presenceAt,
    chat_action: chatAction,
    chat_action_user_id: Number.isFinite(chatActionUserId) ? chatActionUserId : null,
    chat_action_user_name: chatActionUserName,
    chat_action_expires_at: chatActionExpiresAt,
    last_read_outbox_message_id: (() => {
      const raw = Number(row.last_read_outbox_message_id);
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    })(),
    last_read_inbox_message_id: (() => {
      const raw = Number(row.last_read_inbox_message_id);
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    })(),
    last_message_is_outgoing: Boolean(row.last_message_is_outgoing),
    last_message_outgoing_status:
      row.last_message_outgoing_status === "pending" ||
      row.last_message_outgoing_status === "delivered" ||
      row.last_message_outgoing_status === "read" ||
      row.last_message_outgoing_status === "failed"
        ? row.last_message_outgoing_status
        : null,
    last_message_telegram_id: (() => {
      const raw = Number(row.last_message_telegram_id);
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    })(),
    last_message_sender_user_id: (() => {
      const raw = Number(row.last_message_sender_user_id);
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    })(),
    is_pinned: Boolean(row.is_pinned),
    pin_order: typeof row.pin_order === "string" ? row.pin_order : "0",
    in_archive: Boolean(row.in_archive),
    list_tier:
      row.list_tier === "pinned" ||
      row.list_tier === "positioned" ||
      row.list_tier === "unpositioned"
        ? row.list_tier
        : null,
    has_active_voice_chat: Boolean(row.has_active_voice_chat),
    voice_chat_group_call_id: normalizeTelegramGroupCallId(row.voice_chat_group_call_id),
    voice_chat_is_joined: Boolean(row.voice_chat_is_joined),
    peer_is_bot: Boolean(row.peer_is_bot),
    peer_has_main_web_app: Boolean(row.peer_has_main_web_app),
    pending_deleted_message_ids: (() => {
      if (!Array.isArray(row.pending_deleted_message_ids)) return null;
      const ids = row.pending_deleted_message_ids
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
        .map((id: number) => Math.trunc(id));
      return ids.length > 0 ? ids : null;
    })(),
    is_saved_messages: Boolean(row.is_saved_messages),
    profile_photo: normalizeTelegramProfilePhotoMarkup(row.profile_photo),
  };
}

function ingestChatRowProfilePhoto(prev: MessageChatRowData | undefined, next: MessageChatRowData): void {
  if (telegramProfilePhotoMarkupEqual(prev?.profile_photo, next.profile_photo)) return;
  invalidateMessageChatAvatarCacheForChat(next.telegram_chat_id);
  if (next.peer_user_id != null && next.profile_photo) {
    rememberTelegramProfilePhotoMarkup(next.peer_user_id, next.profile_photo);
  }
}

function subtitleSegmentsEqual(
  a: FormattedTextSegment[] | null | undefined,
  b: FormattedTextSegment[] | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.kind !== right.kind || left.text !== right.text) return false;
    if (left.kind === "link" && right.kind === "link" && left.url !== right.url) return false;
    if (
      left.kind === "custom_emoji" &&
      right.kind === "custom_emoji" &&
      left.custom_emoji_id !== right.custom_emoji_id
    ) {
      return false;
    }
    if (left.kind === "animated_emoji" && right.kind === "animated_emoji" && left.emoji !== right.emoji) {
      return false;
    }
  }
  return true;
}

function chatsChanged(prev: MessageChatRowData[], next: MessageChatRowData[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) {
    if (prev[i]?.telegram_chat_id !== next[i]?.telegram_chat_id) return true;
  }
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a === b) continue;
    if (
      a.title !== b.title ||
      a.subtitle !== b.subtitle ||
      !subtitleSegmentsEqual(a.subtitle_segments, b.subtitle_segments) ||
      a.last_message_at !== b.last_message_at ||
      a.unread_count !== b.unread_count ||
      a.avatar_url !== b.avatar_url ||
      !telegramProfilePhotoMarkupEqual(a.profile_photo, b.profile_photo) ||
      a.peer_emoji_status_custom_emoji_id !== b.peer_emoji_status_custom_emoji_id ||
      a.peer_accent_color_light !== b.peer_accent_color_light ||
      a.peer_accent_color_dark !== b.peer_accent_color_dark ||
      a.chat_kind !== b.chat_kind ||
      a.member_count !== b.member_count ||
      a.presence_kind !== b.presence_kind ||
      a.presence_at !== b.presence_at ||
      a.chat_action !== b.chat_action ||
      a.chat_action_user_id !== b.chat_action_user_id ||
      a.chat_action_user_name !== b.chat_action_user_name ||
      a.chat_action_expires_at !== b.chat_action_expires_at ||
      a.last_read_outbox_message_id !== b.last_read_outbox_message_id ||
      a.last_read_inbox_message_id !== b.last_read_inbox_message_id ||
      Boolean(a.last_message_is_outgoing) !== Boolean(b.last_message_is_outgoing) ||
      a.last_message_outgoing_status !== b.last_message_outgoing_status ||
      a.last_message_telegram_id !== b.last_message_telegram_id ||
      a.last_message_sender_user_id !== b.last_message_sender_user_id ||
      Boolean(a.is_pinned) !== Boolean(b.is_pinned) ||
      a.pin_order !== b.pin_order ||
      Boolean(a.in_archive) !== Boolean(b.in_archive) ||
      a.list_tier !== b.list_tier ||
      Boolean(a.has_active_voice_chat) !== Boolean(b.has_active_voice_chat) ||
      a.voice_chat_group_call_id !== b.voice_chat_group_call_id ||
      Boolean(a.voice_chat_is_joined) !== Boolean(b.voice_chat_is_joined) ||
      Boolean(a.peer_is_bot) !== Boolean(b.peer_is_bot) ||
      Boolean(a.peer_has_main_web_app) !== Boolean(b.peer_has_main_web_app)
    ) {
      return true;
    }
  }
  return false;
}

/** Reuse the previous row object when fields match — avoids 100+ row re-renders. */
function reuseChatRowIfEqual(
  prev: MessageChatRowData | undefined,
  next: MessageChatRowData,
): MessageChatRowData {
  if (!prev || prev.telegram_chat_id !== next.telegram_chat_id) {
    ingestChatRowProfilePhoto(prev, next);
    return next;
  }
  ingestChatRowProfilePhoto(prev, next);
  if (
    prev.title === next.title &&
    prev.subtitle === next.subtitle &&
    subtitleSegmentsEqual(prev.subtitle_segments, next.subtitle_segments) &&
    prev.last_message_at === next.last_message_at &&
    prev.unread_count === next.unread_count &&
    prev.avatar_url === next.avatar_url &&
    telegramProfilePhotoMarkupEqual(prev.profile_photo, next.profile_photo) &&
    prev.peer_emoji_status_custom_emoji_id === next.peer_emoji_status_custom_emoji_id &&
    prev.peer_accent_color_light === next.peer_accent_color_light &&
    prev.peer_accent_color_dark === next.peer_accent_color_dark &&
    prev.chat_kind === next.chat_kind &&
    prev.member_count === next.member_count &&
    prev.presence_kind === next.presence_kind &&
    prev.presence_at === next.presence_at &&
    prev.chat_action === next.chat_action &&
    prev.chat_action_user_id === next.chat_action_user_id &&
    prev.chat_action_user_name === next.chat_action_user_name &&
    prev.chat_action_expires_at === next.chat_action_expires_at &&
    prev.last_read_outbox_message_id === next.last_read_outbox_message_id &&
    prev.last_read_inbox_message_id === next.last_read_inbox_message_id &&
    Boolean(prev.last_message_is_outgoing) === Boolean(next.last_message_is_outgoing) &&
    prev.last_message_outgoing_status === next.last_message_outgoing_status &&
    prev.last_message_telegram_id === next.last_message_telegram_id &&
    prev.last_message_sender_user_id === next.last_message_sender_user_id &&
    Boolean(prev.is_pinned) === Boolean(next.is_pinned) &&
    prev.pin_order === next.pin_order &&
    prev.list_tier === next.list_tier &&
    Boolean(prev.has_active_voice_chat) === Boolean(next.has_active_voice_chat) &&
    prev.voice_chat_group_call_id === next.voice_chat_group_call_id &&
    Boolean(prev.voice_chat_is_joined) === Boolean(next.voice_chat_is_joined) &&
    Boolean(prev.peer_is_bot) === Boolean(next.peer_is_bot) &&
    Boolean(prev.peer_has_main_web_app) === Boolean(next.peer_has_main_web_app)
  ) {
    return prev;
  }
  return next;
}

/** Keep stable rows when the gateway returns a truncated snapshot during resync. */
const CHAT_LIST_OVERSIZED_THRESHOLD = 250;

function applyOpenChatUnreadToRows(
  rows: MessageChatRowData[],
  prevRows?: MessageChatRowData[],
): MessageChatRowData[] {
  const prevById =
    prevRows && prevRows.length > 0
      ? new Map(prevRows.map((row) => [row.telegram_chat_id, row]))
      : null;
  let changed = false;
  const next = rows.map((row) => {
    const prevRow = prevById?.get(row.telegram_chat_id);
    const withVoice = mergeChatRowVoicePreferClientClear(prevRow, row);
    const unread = resolveAuthenticatedHomeOpenChatUnread(
      withVoice.unread_count,
      withVoice.telegram_chat_id,
    );
    const withUnread =
      unread === withVoice.unread_count ? withVoice : { ...withVoice, unread_count: unread };
    const reused = reuseChatRowIfEqual(prevRow, withUnread);
    if (reused !== row) changed = true;
    return reused;
  });
  if (!changed) return prevRows && prevRows.length === rows.length ? prevRows : rows;
  return next;
}

function mergeChatRowFields(
  prev: MessageChatRowData,
  fresh: MessageChatRowData,
): MessageChatRowData {
  const withVoice = mergeChatRowVoicePreferClientClear(prev, fresh);
  const unread = resolveAuthenticatedHomeOpenChatUnread(
    withVoice.unread_count,
    withVoice.telegram_chat_id,
  );
  const merged =
    unread === withVoice.unread_count
      ? withVoice
      : { ...withVoice, unread_count: unread };
  return reuseChatRowIfEqual(prev, merged);
}

/** True when every index has the same chat id (order unchanged). */
function chatListOrderMatches(
  prev: MessageChatRowData[],
  sortedIncoming: MessageChatRowData[],
): boolean {
  if (prev.length !== sortedIncoming.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i]!.telegram_chat_id !== sortedIncoming[i]!.telegram_chat_id) return false;
  }
  return true;
}

function mergeChatRows(
  prev: MessageChatRowData[],
  incoming: MessageChatRowData[],
): MessageChatRowData[] {
  if (incoming.length === 0) return prev;
  const sortedIncoming = sortChatRowsTierAware(incoming);
  if (prev.length === 0) {
    return applyOpenChatUnreadToRows(sortedIncoming);
  }

  const prevTier3Count = prev.filter((row) => resolveChatListTier(row) === "unpositioned").length;
  const incomingTier3Count = incoming.filter(
    (row) => resolveChatListTier(row) === "unpositioned",
  ).length;
  const tier3Shrinking = incomingTier3Count < prevTier3Count;

  // Truncated / warm-race snapshot must never wipe a large painted list.
  // Patch overlapping ids, keep prev-only tails, then re-sort so new activity bubbles.
  if (
    !tier3Shrinking &&
    prev.length >= CHAT_LIST_OVERSIZED_THRESHOLD &&
    incoming.length < prev.length * 0.25
  ) {
    const byId = new Map(sortedIncoming.map((row) => [row.telegram_chat_id, row]));
    const prevIds = new Set(prev.map((row) => row.telegram_chat_id));
    const merged: MessageChatRowData[] = prev.map((row) => {
      const fresh = byId.get(row.telegram_chat_id);
      return fresh ? mergeChatRowFields(row, fresh) : row;
    });
    for (const row of sortedIncoming) {
      if (!prevIds.has(row.telegram_chat_id)) {
        merged.push({
          ...row,
          unread_count: resolveAuthenticatedHomeOpenChatUnread(
            row.unread_count,
            row.telegram_chat_id,
          ),
        });
      }
    }
    return sortChatRowsTierAware(merged);
  }

  if (incoming.length >= prev.length) {
    const prevIdSet = new Set(prev.map((row) => row.telegram_chat_id));
    const hasNewIds = sortedIncoming.some((row) => !prevIdSet.has(row.telegram_chat_id));
    // Telegram Web: partial catalog must grow only via scroll append, not poll replace.
    if (
      prev.length >= CHAT_LIST_API_PAGE_SIZE &&
      incoming.length > CHAT_LIST_API_PAGE_SIZE &&
      incoming.length > prev.length + CHAT_LIST_API_PAGE_SIZE
    ) {
      return mergeChatRowsPollPatch(prev, sortedIncoming);
    }
    // Scroll page: disjoint ids, same page size — append instead of replacing the list.
    if (
      hasNewIds &&
      sortedIncoming.every((row) => !prevIdSet.has(row.telegram_chat_id)) &&
      incoming.length <= CHAT_LIST_API_PAGE_SIZE
    ) {
      return appendChatListPage(prev, sortedIncoming);
    }
    // In-place field merge only when order is identical — otherwise chats never
    // bubble (top id can stay put while #2/#3 swap on new messages).
    if (
      prev.length >= CHAT_LIST_VIRTUALIZE_MIN_ROWS &&
      !hasNewIds &&
      chatListOrderMatches(prev, sortedIncoming)
    ) {
      let changed = false;
      const next = prev.map((row, index) => {
        const fresh = sortedIncoming[index]!;
        const reused = mergeChatRowFields(row, fresh);
        if (reused !== row) changed = true;
        return reused;
      });
      return changed ? next : prev;
    }
    return applyOpenChatUnreadToRows(sortedIncoming, prev);
  }

  const byId = new Map(sortedIncoming.map((row) => [row.telegram_chat_id, row]));
  const merged: MessageChatRowData[] = [];
  const mergedIds = new Set<number>();

  for (const row of prev) {
    const fresh = byId.get(row.telegram_chat_id);
    if (fresh) {
      merged.push(mergeChatRowFields(row, fresh));
    } else {
      // Keep prev rows (including unpositioned) when a mid-sync snapshot shrinks.
      merged.push(row);
    }
    mergedIds.add(row.telegram_chat_id);
  }

  for (const row of sortedIncoming) {
    if (!mergedIds.has(row.telegram_chat_id)) {
      merged.push({
        ...row,
        unread_count: resolveAuthenticatedHomeOpenChatUnread(
          row.unread_count,
          row.telegram_chat_id,
        ),
      });
      mergedIds.add(row.telegram_chat_id);
    }
  }

  return sortChatRowsTierAware(merged);
}

/** Poll / since_revision during scroll paging — patch loaded rows only (no full-catalog replace). */
function mergeChatRowsPollPatch(
  prev: MessageChatRowData[],
  incoming: MessageChatRowData[],
): MessageChatRowData[] {
  if (incoming.length === 0 || prev.length === 0) return prev;
  const byId = new Map(incoming.map((row) => [row.telegram_chat_id, row]));
  let changed = false;
  const next = prev.map((row) => {
    const fresh = byId.get(row.telegram_chat_id);
    if (!fresh) return row;
    const merged = mergeChatRowFields(row, fresh);
    if (merged !== row) changed = true;
    return merged;
  });
  if (!changed) return prev;
  // Partial poll/ranking slices must not re-sort the painted catalog — that
  // remounts rows mid-scroll and causes virtual-window / scrollTop oscillation.
  return next;
}

/** Append a server slice (offset > 0). Preserves global list order; patches overlap by id. */
function appendChatListPage(
  prev: MessageChatRowData[],
  pageRows: MessageChatRowData[],
): MessageChatRowData[] {
  if (pageRows.length === 0) return prev;
  const prevIds = new Set(prev.map((row) => row.telegram_chat_id));
  const merged = prev.slice();
  for (const row of pageRows) {
    const id = row.telegram_chat_id;
    if (prevIds.has(id)) {
      const index = merged.findIndex((existing) => existing.telegram_chat_id === id);
      if (index >= 0) {
        merged[index] = mergeChatRowFields(merged[index]!, row);
      }
      continue;
    }
    merged.push({
      ...row,
      unread_count: resolveAuthenticatedHomeOpenChatUnread(row.unread_count, id),
    });
    prevIds.add(id);
  }
  return merged;
}

const MESSAGES_POLL_FAST_MS = 2_000;
const MESSAGES_POLL_SLOW_MS = 5_000;
const MESSAGES_POLL_SLOW_AFTER = 4;
/** Web uses SSE push; slow poll is a reconnect safety net only when stream is healthy. */
const MESSAGES_POLL_STREAM_FALLBACK_MS = 60_000;
const CHAT_LIST_STREAM_ENABLED = typeof EventSource !== "undefined";
export function AuthenticatedHomeMessagesPanel({ colors, scrollable = true }: Props) {
  const { t, tf } = useAppStrings();
  const { openProfileSheet } = useProfileSheet();
  const botWebApp = useMessageChatBotWebApp();
  const { authReady, isAuthenticated, sessionTelegramMessagesConnected } = useAuth();
  const {
    isTelegramMessagesConnected,
    connectedTelegramUserId,
    refreshStatus,
    recoverTelegramMessagesSession,
    userDisconnectedTelegramMessages,
  } = useTelegramMessagesConnection();
  const recoverChatsInFlightRef = useRef(false);
  const [chats, setChats] = useState<MessageChatRowData[]>([]);
  const [chatListTotalCount, setChatListTotalCount] = useState(0);
  const [chatListFetchingMore, setChatListFetchingMore] = useState(false);
  const chatListTotalCountRef = useRef(0);

  const handleChatListOpenApp = useCallback(
    (row: MessageChatRowData) => {
      void openTelegramBotWebApp({
        chatId: row.telegram_chat_id,
        botUserId: row.peer_user_id,
        source: "chat_list",
      }).then((result) => {
        if (!result.ok) return;
        if (botWebApp) {
          botWebApp.open({
            url: result.url,
            title: row.title || t("messages.profile.actions.openApp"),
            launchId: result.launch_id,
          });
          return;
        }
        if (typeof window !== "undefined") {
          window.open(result.url, "_blank", "noopener,noreferrer");
        }
      });
    },
    [botWebApp, t],
  );

  // Push main-list unread only (archived chats stay out of the Messages nav badge).
  useEffect(() => {
    const total = chats.reduce((sum, row) => {
      if (row.in_archive) return sum;
      return sum + (row.unread_count > 0 ? row.unread_count : 0);
    }, 0);
    setTelegramTotalUnread(total);
  }, [chats]);

  const [chatListSync, setChatListSync] = useState<ChatListSyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [gatewayWarming, setGatewayWarming] = useState(false);
  /**
   * True until the first chat-list fetch finishes. Without this, silent mount
   * load + gatewayWarming=false on the first frame flashes "No chats yet".
   */
  const [listBootstrapPending, setListBootstrapPending] = useState(true);
  /**
   * False until the gateway finishes the first positioned chat-list sync.
   * While false, partial cache snapshots stay behind the spinner so the list
   * appears all at once instead of growing 7 → 15 → 287 on cold open.
   */
  const [initialChatListRevealed, setInitialChatListRevealed] = useState(false);
  const initialChatListRevealedRef = useRef(false);
  initialChatListRevealedRef.current = initialChatListRevealed;
  /**
   * True while the gateway briefly clears stableTopReady during an ordered reseed.
   * Keep painted rows on screen; replace (don't merge) when the new seed arrives.
   */
  const awaitingOrderedReseedRef = useRef(false);
  /**
   * True after a successful chat-list fetch returned 0 rows while connected.
   * Avoids flashing `messages.empty` when chats wipe during reconnect races.
   */
  const [emptyListConfirmed, setEmptyListConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    chatListSearchQuery,
    setChatListSearchQuery,
    chatListSearchFocused,
    setChatListSearchFocused,
    dismissChatListSearch,
  } = useMessagesChatListSearch();
  /** Collapsed search sections (`true` = closed). Default open. */
  const [collapsedSearchSections, setCollapsedSearchSections] = useState<Record<string, boolean>>(
    {},
  );
  const [remoteSearchPeerUserIds, setRemoteSearchPeerUserIds] = useState<number[]>([]);
  const [remoteDirectHits, setRemoteDirectHits] = useState<TelegramChatListSearchHit[]>([]);
  const [remoteGlobalHits, setRemoteGlobalHits] = useState<TelegramChatListSearchHit[]>([]);
  const [remoteMessageHits, setRemoteMessageHits] = useState<TelegramChatListSearchHit[]>([]);
  const [remoteMessageCount, setRemoteMessageCount] = useState(0);
  const [recentSearchHits, setRecentSearchHits] = useState<TelegramChatListSearchHit[]>([]);
  const [recentSearchLoaded, setRecentSearchLoaded] = useState(false);
  const selectedChat = useAuthenticatedHomeSelectedChat();
  const compactChatLayout = useAuthenticatedHomeCompactChatLayout();
  const pathname = useResolvedPathname();
  const middleColumnFocus = useAuthenticatedHomeMiddleColumnFocus();
  const selectedChatId = selectedChat?.telegram_chat_id ?? null;
  const selectedChatRef = useRef(selectedChat);
  selectedChatRef.current = selectedChat;
  const compactRowTapRef = useRef<{ chatId: number; at: number } | null>(null);
  const chatOpenGuardRef = useRef<{ chatId: number; at: number } | null>(null);
  /** Keep applyChats urgent while the list is still empty (hard-reload first paint). */
  const chatsCountRef = useRef(0);
  chatsCountRef.current = chats.length;
  const emptyUnchangedForceRef = useRef(false);

  useEffect(() => {
    publishTelegramChatDirectory(chats);
  }, [chats]);

  useEffect(() => {
    if (selectedChatId == null || selectedChat == null) return;
    setChats((prev) =>
      prev.map((row) =>
        row.telegram_chat_id === selectedChatId
          ? { ...row, unread_count: selectedChat.unread_count }
          : row,
      ),
    );
  }, [selectedChat, selectedChat?.unread_count, selectedChatId]);

  useEffect(() => {
    if (!compactChatLayout || selectedChatId == null) return;
    if (!isAuthenticatedHomeCompactChatRoutePushIntent()) return;
    if (pathname === "/messages/chat") return;
    if (typeof window === "undefined") return;
    const timers = [
      window.setTimeout(() => maybePushAuthenticatedHomeCompactChatRoute(), 0),
      window.setTimeout(() => maybePushAuthenticatedHomeCompactChatRoute(), 80),
      window.setTimeout(() => maybePushAuthenticatedHomeCompactChatRoute(), 240),
    ];
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [compactChatLayout, pathname, selectedChatId]);

  useEffect(() => {
    return subscribeChatVoiceMeta((patch) => {
      setChats((prev) => {
        let changed = false;
        const next = prev.map((row) => {
          if (row.telegram_chat_id !== patch.chatId) return row;
          const nextJoined = patch.has_active_voice_chat
            ? Boolean(patch.voice_chat_is_joined ?? row.voice_chat_is_joined)
            : false;
          if (
            Boolean(row.has_active_voice_chat) === patch.has_active_voice_chat &&
            row.voice_chat_group_call_id === patch.voice_chat_group_call_id &&
            Boolean(row.voice_chat_is_joined) === nextJoined
          ) {
            return row;
          }
          changed = true;
          return {
            ...row,
            has_active_voice_chat: patch.has_active_voice_chat,
            voice_chat_group_call_id: patch.voice_chat_group_call_id,
            voice_chat_is_joined: nextJoined,
          };
        });
        return changed ? next : prev;
      });
    });
  }, []);

  // Same undercover row geometry + chat open on compact and wide.
  const wideListChrome = true;
  const chatSelectionEnabled = true;
  const lastGatewayResyncRef = useRef(0);
  const pollCountRef = useRef(0);
  const lastLiveRevisionRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);
  /** True while any loadChats fetch+normalize is running (mount, SSE, metronome). */
  const chatListFetchBusyRef = useRef(false);
  const chatListFetchQueuedRef = useRef<{
    allowAvatarResync?: boolean;
    silent?: boolean;
    forceFull?: boolean;
    /** Archive reveal paint — keep ahead of background list refreshes. */
    priority?: boolean;
    fromScroll?: boolean;
    pageOffset?: number;
    rankingRefreshPage?: number;
  } | null>(null);
  const scheduleChatListRankingRefreshRef = useRef<(() => void) | null>(null);
  const chatListRankingRefreshInflightRef = useRef(false);
  const chatListRankingRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatListStreamFlushAtRef = useRef(0);
  const unchangedPollStreakRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** SSE open + recent ready/ping/revision — gates the 60s safety poll. */
  const chatListStreamHealthyRef = useRef(false);
  const chatListAtBottomRef = useRef(false);
  const loadMoreTierRef = useRef<"positioned" | "unpositioned">("positioned");
  /** User scrolled the list away from the top — allow archive reveal (not on first paint). */
  const [archiveRevealRequested, setArchiveRevealRequested] = useState(false);
  /**
   * Archive sync can report ready before the chat payload is painted (the ready
   * flag is applied urgently; rows land in a transition). Keep the loading row
   * until a ready snapshot with zero archive dialogs has actually been applied.
   */
  const [archiveEmptyConfirmed, setArchiveEmptyConfirmed] = useState(false);
  const archiveRevealPendingRef = useRef(false);
  const chatsHaveArchiveRef = useRef(false);
  const archivePaintFetchStartedRef = useRef(false);
  useEffect(() => {
    chatsHaveArchiveRef.current = chats.some((row) => Boolean(row.in_archive));
  }, [chats]);
  const [archiveScrollArmed, setArchiveScrollArmed] = useState(false);
  const archiveScrollArmedRef = useRef(false);
  /** Chat-list rows fetched while the voice dialog was open — apply on close. */
  const deferredVoiceChatListRef = useRef<{
    rows: MessageChatRowData[];
    json: {
      source?: string | null;
      revision?: number | null;
    };
    started: number;
    missingPreviewCount: number;
    missingAvatarFieldCount: number;
    silent: boolean;
  } | null>(null);
  /** Silent poll skipped entirely while voice dialog open — refetch on close. */
  const deferredSilentChatLoadRef = useRef(false);
  /** Bumped when the voice sheet opens so in-flight startTransition applies abort. */
  const chatListApplyEpochRef = useRef(0);
  const [chatListScrollTick, setChatListScrollTick] = useState(0);
  const chatListScrollRafRef = useRef<number | null>(null);
  const chatListVirtualStickyRef = useRef({ startIndex: 0, endIndex: 0 });
  const chatListVirtualStickyFreezeRef = useRef<{
    startIndex: number;
    endIndex: number;
  } | null>(null);
  const chatListAppendRestoreAnchorRef = useRef<HspScrollAnchor | null>(null);
  const chatListVirtualWindowRef = useRef<ReturnType<typeof resolveChatListVirtualWindow> | null>(null);
  /** While parked on the catalog tail, never shrink virtual row count — phantom/tail toggles were flipping endIndex ±1. */
  const chatListVirtualTotalBottomPinRef = useRef<number | null>(null);
  const loadChatsRef = useRef<
    (options?: {
      allowAvatarResync?: boolean;
      silent?: boolean;
      forceFull?: boolean;
      priority?: boolean;
      pageOffset?: number;
      fromScroll?: boolean;
      rankingRefreshPage?: number;
    }) => Promise<void>
  >(async () => {});

  const scheduleChatListRankingRefresh = useCallback(() => {
    if (rankingRefreshPageCount() <= 1) return;
    if (chatListRankingRefreshTimerRef.current != null) return;
    chatListRankingRefreshTimerRef.current = setTimeout(() => {
      chatListRankingRefreshTimerRef.current = null;
      if (chatListRankingRefreshInflightRef.current) return;
      if (isChatListScrollPageFetchInFlight()) return;
      const metrics = getChatListScrollMetrics();
      if (metrics.scrollY > MESSAGE_ROW_HEIGHT_PX * 4) return;
      chatListRankingRefreshInflightRef.current = true;
      const generation = chatListScrollPaginationGeneration();
      void (async () => {
        try {
          const pages = rankingRefreshPageCount();
          for (let page = 1; page <= pages; page += 1) {
            if (generation !== chatListScrollPaginationGeneration()) return;
            await loadChatsRef.current({
              silent: true,
              allowAvatarResync: false,
              rankingRefreshPage: page,
            });
          }
        } finally {
          chatListRankingRefreshInflightRef.current = false;
        }
      })();
    }, 1_800);
  }, []);

  useEffect(() => {
    scheduleChatListRankingRefreshRef.current = scheduleChatListRankingRefresh;
  }, [scheduleChatListRankingRefresh]);

  const applyChatListSync = useCallback((status: ChatListSyncStatus | null | undefined) => {
    if (!status) return;
    setChatListSync((prev) => {
      const merged: ChatListSyncStatus = prev ? { ...prev, ...status } : status;
      const holdingOrderedReseed =
        prev?.stableTopReady === true &&
        merged.stableTopReady !== true &&
        initialChatListRevealedRef.current;
      if (holdingOrderedReseed) {
        // Keep the already-painted ordered rows visible while the gateway
        // reseeds — clearing here forced a long spinner over the whole list.
        awaitingOrderedReseedRef.current = true;
        queueMicrotask(() => {
          setGatewayWarming(true);
        });
      }
      return merged;
    });
    setChatListSyncStatus(status);
  }, []);

  const requestLoadMoreChats = useCallback(async (tier: "positioned" | "unpositioned" = "positioned") => {
    loadMoreTierRef.current = tier;
    try {
      const response = await fetch(buildApiUrl("/api/telegram-messages-chats-load-more"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        started?: boolean;
        chatListSync?: ChatListSyncStatus;
      };
      if (json.chatListSync) {
        applyChatListSync(json.chatListSync);
      }
      // Only re-pull when the gateway actually grew the cache or is still paging.
      const cached = json.chatListSync?.cachedCount ?? 0;
      const grew = cached > chatsCountRef.current;
      const stillPaging = json.chatListSync?.inProgress === true || json.started === true;
      if (json.chatListSync?.cachedCount != null) {
        const nextTotal = Math.max(
          chatListTotalCountRef.current,
          json.chatListSync.cachedCount,
        );
        chatListTotalCountRef.current = nextTotal;
        setChatListTotalCount(nextTotal);
      }
      if ((grew || stillPaging) && !isVoiceDialogUiOpen()) {
        logPageDisplay("messages_chats_gateway_page_ready", {
          tier,
          cached: json.chatListSync?.cachedCount ?? null,
          loaded: chatsCountRef.current,
          grew,
          stillPaging,
        });
        repairChatListPaginationFromClient(
          chatsCountRef.current,
          Math.max(chatListTotalCountRef.current, cached),
        );
        if (
          chatListScrollHasMore() &&
          chatListScrollCatalogPartial(
            chatsCountRef.current,
            Math.max(chatListTotalCountRef.current, cached),
          )
        ) {
          requestChatListCatalogNextPage(chatsCountRef.current, Math.max(chatListTotalCountRef.current, cached), {
            allowAvatarResync: true,
          });
        } else if (grew) {
          void loadChatsRef.current({ silent: true, allowAvatarResync: false });
        }
      }
    } catch {
      /* poll / SSE will pick up background pages */
    }
  }, [applyChatListSync]);

  const requestArchiveChats = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/telegram-messages-chats-load-more"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        started?: boolean;
        ready?: boolean;
        archiveCount?: number | null;
        chatListSync?: ChatListSyncStatus;
      };
      if (json.chatListSync) {
        applyChatListSync(json.chatListSync);
      }
      const archiveCount =
        typeof json.archiveCount === "number" && Number.isFinite(json.archiveCount)
          ? Math.max(0, Math.trunc(json.archiveCount))
          : null;
      const archiveReady =
        json.ready === true || json.chatListSync?.archiveListReady === true;
      const archiveInProgress = json.chatListSync?.archiveListInProgress === true;
      logPageDisplay("messages_archive_sync", {
        started: json.started === true,
        ready: archiveReady,
        inProgress: archiveInProgress,
        archiveCount,
      });
      if (archiveReady && archiveCount === 0 && archiveInProgress !== true) {
        setArchiveEmptyConfirmed(true);
        archiveRevealPendingRef.current = false;
        return;
      }
      if (archiveCount != null && archiveCount > 0) {
        setArchiveEmptyConfirmed(false);
      }
      if (isVoiceDialogUiOpen()) return;
      if (!archiveReady && json.started === true) {
        // Sync just started — wait for archive rows; a main-list forceFull
        // would still omit them and used to confirm empty.
        return;
      }
      if (
        chatListScrollCatalogPartial(
          chatsCountRef.current,
          chatListTotalCountRef.current,
        )
      ) {
        return;
      }
      void loadChatsRef.current({ silent: true, forceFull: true, priority: true });
    } catch {
      /* poll / SSE will pick up archive rows */
    }
  }, [applyChatListSync]);

  const gatewayResyncInflightRef = useRef<Promise<boolean> | null>(null);
  const triggerGatewayResync = useCallback(async (reason: string) => {
    if (gatewayResyncInflightRef.current) {
      logPageDisplay("messages_gateway_resync_coalesce", { reason });
      return gatewayResyncInflightRef.current;
    }
    const url = buildApiUrl("/api/telegram-messages-resync");
    const started = Date.now();
    const run = (async () => {
      try {
        const response = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const json = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          chatCount?: number;
          error?: string;
          needsReconnect?: boolean;
          connected?: boolean;
          warming?: boolean;
        };
        setGatewayWarming(Boolean(json.warming));
        logPageDisplay("messages_gateway_resync", {
          reason,
          ok: json.ok ?? false,
          warming: json.warming ?? false,
          chatCount: json.chatCount ?? null,
          error: json.error ?? null,
          needsReconnect: json.needsReconnect ?? false,
          elapsedMs: Date.now() - started,
          status: response.status,
        });
        lastGatewayResyncRef.current = Date.now();
        if (response.status >= 500) {
          setGatewayWarming(false);
          logPageDisplay("messages_gateway_resync_timeout", {
            reason,
            status: response.status,
            elapsedMs: Date.now() - started,
          });
          const recovered = await recoverTelegramMessagesSession();
          if (!recovered) await refreshStatus();
          return false;
        }
        if (json.warming) {
          return true;
        }
        if (json.needsReconnect || json.connected === false || response.status === 403) {
          setGatewayWarming(false);
          const recovered = await recoverTelegramMessagesSession();
          if (!recovered) await refreshStatus();
          return false;
        }
        // Do not clear warming while the list is still empty — resync often
        // finishes before startTransition applies the first chat rows, which
        // briefly showed "No chats yet." and raced a heavy sync apply.
        if (json.ok && (json.chatCount ?? 0) > 0 && chatsCountRef.current > 0) {
          setGatewayWarming(false);
        }
        return response.ok && json.ok !== false;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logPageDisplay("messages_gateway_resync_error", { reason, message });
        return false;
      } finally {
        gatewayResyncInflightRef.current = null;
      }
    })();
    gatewayResyncInflightRef.current = run;
    return run;
  }, [recoverTelegramMessagesSession, refreshStatus]);

  const loadChats = useCallback(async (options?: {
    allowAvatarResync?: boolean;
    silent?: boolean;
    forceFull?: boolean;
    priority?: boolean;
    pageOffset?: number;
    fromScroll?: boolean;
    rankingRefreshPage?: number;
  }) => {
    if (!isAuthenticated || !isTelegramMessagesConnected) {
      if (!isAuthenticated) {
        setChats([]);
        setEmptyListConfirmed(false);
        setListBootstrapPending(false);
      } else if (
        userDisconnectedTelegramMessages ||
        sessionTelegramMessagesConnected === false
      ) {
        setChats([]);
        setEmptyListConfirmed(false);
        setListBootstrapPending(false);
      } else {
        setListBootstrapPending(true);
        if (sessionTelegramMessagesConnected === true && !recoverChatsInFlightRef.current) {
          recoverChatsInFlightRef.current = true;
          void recoverTelegramMessagesSession()
            .then((ok) => {
              if (ok) void loadChatsRef.current({ silent: false, forceFull: true });
            })
            .finally(() => {
              recoverChatsInFlightRef.current = false;
            });
        }
      }
      setError(null);
      setLoading(false);
      setGatewayWarming(false);
      return;
    }
    // Coalesce overlapping callers (mount + SSE + metronome). Without this,
    // 3–4×170-row normalize/apply stacks freeze the shell and voice Close.
    if (chatListFetchBusyRef.current) {
      const prev = chatListFetchQueuedRef.current;
      const priority = Boolean(prev?.priority || options?.priority);
      const forceFull = Boolean(prev?.forceFull || options?.forceFull || priority);
      const incomingScroll = options?.fromScroll === true;
      const keepScroll = !forceFull && (incomingScroll || prev?.fromScroll === true);
      chatListFetchQueuedRef.current = {
        allowAvatarResync: Boolean(prev?.allowAvatarResync || options?.allowAvatarResync),
        forceFull,
        silent: prev != null
          ? prev.silent === true && options?.silent === true
          : options?.silent === true,
        priority,
        fromScroll: keepScroll,
        rankingRefreshPage: options?.rankingRefreshPage ?? prev?.rankingRefreshPage,
      };
      return;
    }
    if (options?.forceFull) {
      resetChatListScrollPagination();
    }
    const partialCatalogPainted = chatListScrollCatalogPartial(
      chatsCountRef.current,
      chatListTotalCountRef.current,
    );
    if (
      options?.forceFull &&
      partialCatalogPainted &&
      !options?.priority
    ) {
      chatListFetchBusyRef.current = false;
      return;
    }
    chatListFetchBusyRef.current = true;
    const fromScroll = options?.fromScroll === true;
    const rankingRefresh = typeof options?.rankingRefreshPage === "number";
    if (fromScroll && !rankingRefresh && !beginChatListScrollPageFetch()) {
      chatListFetchBusyRef.current = false;
      return;
    }
    // Telegram Web: while the call sheet is open, do not fetch/parse the chat
    // list on the UI thread at all (not only silent polls).
    if (isVoiceDialogUiOpen()) {
      deferredSilentChatLoadRef.current = true;
      chatListFetchBusyRef.current = false;
      if (fromScroll && !rankingRefresh) {
        endChatListScrollPageFetch();
      }
      logPageDisplay("messages_chats_poll_skip_fetch_voice_dialog", {
        forceFull: Boolean(options?.forceFull),
        silent: Boolean(options?.silent),
      });
      const skippedQueued = chatListFetchQueuedRef.current;
      if (skippedQueued) {
        chatListFetchQueuedRef.current = null;
        if (skippedQueued.silent === true || isVoiceDialogUiOpen()) {
          deferredSilentChatLoadRef.current = true;
        } else {
          void loadChatsRef.current(skippedQueued);
        }
      }
      return;
    }
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    repairChatListPaginationFromClient(
      chatsCountRef.current,
      chatListTotalCountRef.current,
    );
    const params = new URLSearchParams();
    const pageOffset = resolveChatListFetchOffset({
      fromScroll: options?.fromScroll,
      pageOffset:
        typeof options?.rankingRefreshPage === "number"
          ? rankingRefreshOffsetForPage(options.rankingRefreshPage)
          : options?.pageOffset,
    });
    const listFullyLoaded = chatListPaginationFullyLoaded(
      chatsCountRef.current,
      chatListTotalCountRef.current,
    );
    const usingSinceRevision =
      options?.silent === true &&
      !options?.forceFull &&
      options?.fromScroll !== true &&
      pageOffset === 0 &&
      listFullyLoaded &&
      lastLiveRevisionRef.current != null &&
      lastLiveRevisionRef.current > 0;
    if (usingSinceRevision) {
      params.set("since_revision", String(lastLiveRevisionRef.current));
    }
    // One scroll/catalog page per request (25 rows). Full list only on explicit forceFull.
    const wantsPagedFetch = !options?.forceFull && !usingSinceRevision;
    if (wantsPagedFetch) {
      params.set("limit", String(CHAT_LIST_API_PAGE_SIZE));
      params.set("offset", String(pageOffset));
    }
    const query = params.toString();
    const url = buildApiUrl(query ? `/api/telegram-messages-chats?${query}` : "/api/telegram-messages-chats");
    const started = Date.now();
    let scheduleRankingAfterScroll = false;
    if (wantsPagedFetch && pageOffset > 0) {
      setChatListFetchingMore(true);
    }
    if (wantsPagedFetch && !rankingRefresh) {
      logPageDisplay("messages_chats_page_fetch", {
        offset: pageOffset,
        limit: CHAT_LIST_API_PAGE_SIZE,
        fromScroll: options?.fromScroll === true,
        forceFull: Boolean(options?.forceFull),
        nextPage: getChatListLoadedPages() + 1,
      });
    }
    const scrollPageOffsetReserved = fromScroll && !rankingRefresh;
    let scrollPageOffsetCommitted = false;
    try {
      const response = await fetch(url, { method: "GET", credentials: "include" });
      // Sheet may have opened while the request was in flight — skip JSON parse
      // of ~260 chats (main-thread longtask) and apply on close instead.
      if (isVoiceDialogUiOpen()) {
        deferredSilentChatLoadRef.current = true;
        logPageDisplay("messages_chats_poll_skip_parse_voice_dialog", {
          forceFull: Boolean(options?.forceFull),
          silent: Boolean(options?.silent),
          elapsedMs: Date.now() - started,
          status: response.status,
        });
        return;
      }
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        unchanged?: boolean;
        chats?: unknown[];
        error?: string;
        source?: string;
        revision?: number;
        totalCount?: number;
        chatListSync?: ChatListSyncStatus;
      };
      if (!response.ok || !json.ok) {
        throw new Error(json.error || `HTTP_${response.status}`);
      }
      if (isVoiceDialogUiOpen()) {
        deferredSilentChatLoadRef.current = true;
        logPageDisplay("messages_chats_poll_skip_apply_voice_dialog", {
          forceFull: Boolean(options?.forceFull),
          silent: Boolean(options?.silent),
          elapsedMs: Date.now() - started,
          revision: typeof json.revision === "number" ? json.revision : null,
        });
        return;
      }
      if (json.unchanged) {
        if (typeof json.revision === "number") {
          lastLiveRevisionRef.current = json.revision;
        }
        applyChatListSync(json.chatListSync);
        // Cold paint: an "unchanged" with no rows must not clear bootstrap and
        // leave emptyListConfirmed=false (infinite spinner / delayed list).
        if (chatsCountRef.current === 0 && !emptyUnchangedForceRef.current) {
          emptyUnchangedForceRef.current = true;
          setEmptyListConfirmed(false);
          queueMicrotask(() => {
            void loadChatsRef.current({ silent: false, pageOffset: 0 });
          });
        } else if (
          archiveRevealPendingRef.current &&
          json.chatListSync?.archiveListReady === true &&
          json.chatListSync.archiveListInProgress !== true &&
          !chatsHaveArchiveRef.current
        ) {
          // Ready flag can race ahead of the archive payload. Do NOT drop the
          // loading row on "unchanged" — force a full paint instead.
          queueMicrotask(() => {
            if (!isVoiceDialogUiOpen()) {
              void loadChatsRef.current({ silent: true, forceFull: true, priority: true });
            }
          });
        }
        unchangedPollStreakRef.current += 1;
        if (options?.silent && pollCountRef.current % 10 === 0) {
          logPageDisplay("messages_chats_poll_unchanged", {
            poll: pollCountRef.current,
            revision: json.revision ?? null,
            elapsedMs: Date.now() - started,
          });
        }
        return;
      }
      unchangedPollStreakRef.current = 0;
      const rows: MessageChatRowData[] = [];
      if (Array.isArray(json.chats)) {
        for (const raw of json.chats) {
          const row = normalizeChat(raw);
          if (row) rows.push(row);
        }
      }
      const missingPreviewCount = rows.filter((row) => !row.subtitle.trim()).length;
      const missingAvatarFieldCount = rows.filter((row) => !row.avatar_url).length;
      if (wantsPagedFetch && rows.length > CHAT_LIST_API_PAGE_SIZE) {
        logPageDisplay("messages_chats_page_overshoot", {
          received: rows.length,
          cap: CHAT_LIST_API_PAGE_SIZE,
          offset: pageOffset,
        });
        rows.splice(CHAT_LIST_API_PAGE_SIZE);
      }
      const totalCount =
        typeof json.totalCount === "number" && Number.isFinite(json.totalCount)
          ? Math.max(0, Math.trunc(json.totalCount))
          : rows.length;
      const syncedTotal = Math.max(
        totalCount,
        json.chatListSync?.cachedCount ?? 0,
      );
      chatListTotalCountRef.current = syncedTotal;
      setChatListTotalCount(syncedTotal);
      if (wantsPagedFetch && !rankingRefresh) {
        noteChatListPageLoaded(pageOffset, rows.length, syncedTotal);
        if (scrollPageOffsetReserved && rows.length > 0) {
          scrollPageOffsetCommitted = true;
        }
        if (fromScroll && rows.length > 0) {
          scheduleRankingAfterScroll = true;
        }
      }
      if (wantsPagedFetch && pageOffset === 0 && rows.length > 0) {
        logPageDisplay("messages_chats_catalog_first_page", {
          pageItems: rows.length,
          total: syncedTotal,
          elapsedMs: Date.now() - started,
        });
      } else if (wantsPagedFetch && pageOffset > 0 && rows.length > 0) {
        logPageDisplay("messages_chats_page_ok", {
          offset: pageOffset,
          pageItems: rows.length,
          loaded: pageOffset + rows.length,
          total: syncedTotal,
          elapsedMs: Date.now() - started,
        });
        if (options?.fromScroll === true) {
          logPageDisplay("messages_chats_load_more", {
            offset: pageOffset,
            limit: CHAT_LIST_API_PAGE_SIZE,
            sliceItems: rows.length,
            serverCount: syncedTotal,
            loadedThrough: pageOffset + rows.length,
            elapsedMs: Date.now() - started,
          });
        }
      } else if (wantsPagedFetch && pageOffset === 0 && rows.length > 0 && options?.fromScroll === true) {
        logPageDisplay("messages_chats_load_more", {
          offset: pageOffset,
          limit: CHAT_LIST_API_PAGE_SIZE,
          sliceItems: rows.length,
          serverCount: syncedTotal,
          loadedThrough: rows.length,
          elapsedMs: Date.now() - started,
        });
      }
      if (json.source === "live" && typeof json.revision === "number") {
        lastLiveRevisionRef.current = json.revision;
      }
      applyChatListSync(json.chatListSync);
      // Drop ALL in-flight chat-list paints while the voice sheet is open —
      // including forceFull. forceFull used to bypass this gate and land
      // messages_chats_poll_updated + avatar remounts mid-dialog (535ms freeze).
      if (isVoiceDialogUiOpen()) {
        deferredVoiceChatListRef.current = {
          rows,
          json: {
            source: json.source ?? null,
            revision: typeof json.revision === "number" ? json.revision : null,
          },
          started,
          missingPreviewCount,
          missingAvatarFieldCount,
          silent: Boolean(options?.silent),
        };
        logPageDisplay("messages_chats_poll_deferred_voice_dialog", {
          count: rows.length,
          poll: pollCountRef.current,
          revision: json.revision ?? null,
          elapsedMs: Date.now() - started,
          forceFull: Boolean(options?.forceFull),
          silent: Boolean(options?.silent),
        });
        return;
      }
      const applyEpoch = chatListApplyEpochRef.current;
      const stashDeferredVoiceRows = (reason: string) => {
        deferredVoiceChatListRef.current = {
          rows,
          json: {
            source: json.source ?? null,
            revision: typeof json.revision === "number" ? json.revision : null,
          },
          started,
          missingPreviewCount,
          missingAvatarFieldCount,
          silent: Boolean(options?.silent),
        };
        logPageDisplay("messages_chats_poll_deferred_voice_dialog", {
          count: rows.length,
          poll: pollCountRef.current,
          revision: json.revision ?? null,
          elapsedMs: Date.now() - started,
          reason,
          forceFull: Boolean(options?.forceFull),
        });
      };
      const applyChats = () => {
        // Re-check inside startTransition — the gate above can pass before Join,
        // then this callback runs after the sheet opens and freezes Close.
        if (
          applyEpoch !== chatListApplyEpochRef.current ||
          isVoiceDialogUiOpen()
        ) {
          stashDeferredVoiceRows(
            applyEpoch !== chatListApplyEpochRef.current
              ? "apply_epoch_bumped"
              : "start_transition_after_open",
          );
          return;
        }
        deferredVoiceChatListRef.current = null;
        setChats((prev) => {
          // Critical: React may run this updater after Join even when applyChats
          // checked the gate earlier (logs: chats_poll_updated mid-dialog →
          // avatar storm → UI dead after one green mic).
          if (
            applyEpoch !== chatListApplyEpochRef.current ||
            isVoiceDialogUiOpen()
          ) {
            deferredVoiceChatListRef.current = {
              rows,
              json: {
                source: json.source ?? null,
                revision: typeof json.revision === "number" ? json.revision : null,
              },
              started,
              missingPreviewCount,
              missingAvatarFieldCount,
              silent: Boolean(options?.silent),
            };
            queueMicrotask(() => {
              logPageDisplay("messages_chats_poll_deferred_voice_dialog", {
                count: rows.length,
                poll: pollCountRef.current,
                revision: json.revision ?? null,
                elapsedMs: Date.now() - started,
                reason: "set_chats_updater_after_open",
                forceFull: Boolean(options?.forceFull),
              });
            });
            return prev;
          }
          const syncReady = json.chatListSync?.stableTopReady === true;
          // First ordered paint / reseed: replace, never merge — merge can keep a wrong-order skeleton.
          if (
            rows.length > 0 &&
            syncReady &&
            pageOffset === 0 &&
            !rankingRefresh &&
            (!initialChatListRevealedRef.current || awaitingOrderedReseedRef.current)
          ) {
            const firstPaint = applyOpenChatUnreadToRows(sortChatRowsTierAware(rows));
            const hasArchive = firstPaint.some((row) => Boolean(row.in_archive));
            chatsHaveArchiveRef.current = hasArchive;
            if (hasArchive) {
              archiveRevealPendingRef.current = false;
            }
            queueMicrotask(() => syncAuthenticatedHomeSelectedChat(firstPaint));
            awaitingOrderedReseedRef.current = false;
            setInitialChatListRevealed(true);
            setGatewayWarming(false);
            setEmptyListConfirmed(false);
            if (options?.silent) {
              logPageDisplay("messages_chats_poll_updated", {
                count: firstPaint.length,
                ...firstChatListLogFields(firstPaint),
                poll: pollCountRef.current,
                source: json.source ?? null,
                revision: json.revision ?? null,
                elapsedMs: Date.now() - started,
                missingPreviewCount,
                missingAvatarFieldCount,
                firstPaint: true,
                pageOffset,
                totalCount,
                paged: wantsPagedFetch,
              });
            }
            return firstPaint;
          }
          // Hold UI empty only before the first ordered paint. After paint, keep
          // the previous ordered rows while the gateway reseeds (no full-list spinner).
          if (!syncReady) {
            if (!initialChatListRevealedRef.current) return prev;
            awaitingOrderedReseedRef.current = true;
            return prev;
          }
      const scrollCatalogPartial =
        !options?.forceFull &&
        chatListScrollCatalogPartial(
          prev.length,
          chatListTotalCountRef.current,
        );
          const pollPatchOnly =
            scrollCatalogPartial &&
            !wantsPagedFetch &&
            rows.length > CHAT_LIST_API_PAGE_SIZE;
          const scrollAppend =
            wantsPagedFetch && pageOffset > 0 && !rankingRefresh;
          const patchLoadedRowsOnly = scrollCatalogPartial && !scrollAppend;
          const next = scrollAppend
            ? appendChatListPage(prev, rows)
            : patchLoadedRowsOnly || pollPatchOnly || rankingRefresh
              ? mergeChatRowsPollPatch(prev, rows)
              : mergeChatRows(prev, rows);
          if (!wantsPagedFetch && !rankingRefresh && !scrollCatalogPartial) {
            syncChatListPaginationAfterFullLoad(next.length, syncedTotal);
          } else if (!rankingRefresh) {
            repairChatListPaginationFromClient(next.length, syncedTotal);
          }
          const hasArchive = next.some((row) => Boolean(row.in_archive));
          chatsHaveArchiveRef.current = hasArchive;
          if (hasArchive) {
            archiveRevealPendingRef.current = false;
          }
          const changed = chatsChanged(prev, next);
          queueMicrotask(() => syncAuthenticatedHomeSelectedChat(next));
          if (rows.length > 0) {
            if (syncReady) setGatewayWarming(false);
            setEmptyListConfirmed(false);
          } else if (prev.length === 0) {
            setEmptyListConfirmed(true);
          }
          if (options?.silent) {
            if (changed) {
              logPageDisplay("messages_chats_poll_updated", {
                count: next.length,
                ...firstChatListLogFields(next),
                poll: pollCountRef.current,
                source: json.source ?? null,
                revision: json.revision ?? null,
                elapsedMs: Date.now() - started,
                missingPreviewCount,
                missingAvatarFieldCount,
              });
            } else if (pollCountRef.current % 10 === 0) {
              logPageDisplay("messages_chats_poll_steady", {
                count: next.length,
                poll: pollCountRef.current,
                source: json.source ?? null,
                revision: json.revision ?? null,
                elapsedMs: Date.now() - started,
              });
            }
            return changed ? next : prev;
          }
          return next;
        });
        if (rows.length > 0 && typeof document !== "undefined") {
          document.dispatchEvent(
            new CustomEvent("hsp-telegram-chats-loaded", { detail: { count: rows.length } }),
          );
        }
      };
      // First paint must stay urgent — startTransition deferred the empty→rows
      // apply for seconds behind history/voice work (long "No chats yet" / spinner).
      // Large silent refreshes stay interruptible once the list already has rows.
      // Archive reveal: apply urgently so the loading row swaps to the folder in the
      // same turn (deferred apply left sticky chrome thrashing on repeat forceFull).
      const archiveRevealNeedsUrgentPaint =
        archiveRevealPendingRef.current &&
        (json.chatListSync?.archiveListReady === true ||
          rows.some((row) => Boolean(row.in_archive)));
      const urgentSilentPartial =
        Boolean(options?.silent) &&
        chatListScrollCatalogPartial(
          chatsCountRef.current,
          chatListTotalCountRef.current,
        );
      const rankingPatchWhileScrolling =
        rankingRefresh &&
        urgentSilentPartial &&
        getChatListScrollMetrics().scrollY > MESSAGE_ROW_HEIGHT_PX * 2;
      const scrollAppend =
        wantsPagedFetch && pageOffset > 0 && !rankingRefresh;
      const preserveScrollOnAppend = scrollAppend;
      const scrollPreserveAnchor = preserveScrollOnAppend
        ? captureChatListScrollPreserveAnchor()
        : null;
      if (scrollPreserveAnchor && chatListVirtualWindowRef.current?.enabled) {
        chatListVirtualStickyFreezeRef.current = {
          startIndex: chatListVirtualStickyRef.current.startIndex,
          endIndex: chatListVirtualStickyRef.current.endIndex,
        };
      }
      const runApplyChats = () => {
        applyChats();
        if (scrollPreserveAnchor) {
          chatListAppendRestoreAnchorRef.current = scrollPreserveAnchor;
          restoreChatListScrollPreserveAnchor(scrollPreserveAnchor);
        }
      };
      if (
        chatsCountRef.current === 0 ||
        archiveRevealNeedsUrgentPaint ||
        wantsPagedFetch ||
        options?.fromScroll === true ||
        (urgentSilentPartial && !rankingPatchWhileScrolling)
      ) {
        runApplyChats();
      } else if (
        initialChatListRevealedRef.current &&
        (rows.length >= CHAT_LIST_API_PAGE_SIZE || Boolean(options?.silent))
      ) {
        startTransition(runApplyChats);
      } else {
        runApplyChats();
      }
      if (!options?.silent) {
        logPageDisplay("messages_chats_loaded", {
          count: rows.length,
          ...firstChatListLogFields(rows),
          source: json.source ?? null,
          revision: json.revision ?? null,
          status: response.status,
          elapsedMs: Date.now() - started,
          missingPreviewCount,
          missingAvatarFieldCount,
        });
        telegramEmojiDebug.chatListSummary(rows);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "not_connected" || message.startsWith("HTTP_403")) {
        const recovered = await recoverTelegramMessagesSession();
        if (recovered) {
          void loadChatsRef.current({
            silent: Boolean(options?.silent),
            forceFull: true,
            allowAvatarResync: options?.allowAvatarResync,
          });
          return;
        }
      }
      if (!options?.silent) {
        logPageDisplay("messages_chats_error", { message, elapsedMs: Date.now() - started });
        setError(message);
        // Keep existing rows when link dropped mid-session — empty flash is worse.
        if (chatsCountRef.current === 0) {
          setChats([]);
          setEmptyListConfirmed(true);
        }
      } else {
        logPageDisplay("messages_chats_poll_error", {
          message,
          poll: pollCountRef.current,
          elapsedMs: Date.now() - started,
        });
      }
    } finally {
      if (scrollPageOffsetReserved && !scrollPageOffsetCommitted) {
        rollbackChatListScrollFetchReservation();
      }
      if (fromScroll && !rankingRefresh) {
        endChatListScrollPageFetch();
      }
      if (wantsPagedFetch && pageOffset > 0) {
        setChatListFetchingMore(false);
      }
      if (!options?.silent) setLoading(false);
      setListBootstrapPending(false);
      chatListFetchBusyRef.current = false;
      if (scheduleRankingAfterScroll) {
        if (
          !chatListScrollCatalogPartial(
            chatsCountRef.current,
            chatListTotalCountRef.current,
          )
        ) {
          scheduleChatListRankingRefreshRef.current?.();
        }
      }
      const queued = chatListFetchQueuedRef.current;
      if (queued) {
        chatListFetchQueuedRef.current = null;
        void loadChatsRef.current(queued);
      }
    }
  }, [
    applyChatListSync,
    isAuthenticated,
    isTelegramMessagesConnected,
    recoverTelegramMessagesSession,
    sessionTelegramMessagesConnected,
    userDisconnectedTelegramMessages,
  ]);

  useEffect(() => {
    loadChatsRef.current = loadChats;
  }, [loadChats]);

  useEffect(() => {
    registerChatListScrollPageLoader(async (options) => {
      await loadChatsRef.current({
        silent: true,
        fromScroll: true,
        allowAvatarResync: options.allowAvatarResync,
      });
    });
    return () => registerChatListScrollPageLoader(null);
  }, []);

  const streamRevisionPendingRef = useRef<number | null>(null);
  const streamLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushStreamChatLoad = useCallback(async () => {
    const pendingRevision = streamRevisionPendingRef.current;
    if (
      pendingRevision != null &&
      lastLiveRevisionRef.current != null &&
      pendingRevision <= lastLiveRevisionRef.current
    ) {
      streamRevisionPendingRef.current = null;
      return;
    }
    if (pollInFlightRef.current) {
      // Coalesce — a 250ms retry stack raced the metronome and duplicated loads.
      if (streamLoadTimerRef.current == null) {
        streamLoadTimerRef.current = setTimeout(() => {
          streamLoadTimerRef.current = null;
          void flushStreamChatLoad();
        }, 1_500);
      }
      return;
    }
    if (
      !initialChatListRevealedRef.current &&
      (chatListFetchBusyRef.current || chatsCountRef.current === 0)
    ) {
      return;
    }
    pollInFlightRef.current = true;
    const pendingAtStart = streamRevisionPendingRef.current;
    try {
      const loadedPages = getChatListLoadedPages();
      const partialCatalog = chatListScrollCatalogPartial(
        chatsCountRef.current,
        chatListTotalCountRef.current,
      );
      if (partialCatalog && loadedPages >= 1) {
        const now = Date.now();
        const metrics = getChatListScrollMetrics();
        const minGapMs =
          metrics.scrollY > MESSAGE_ROW_HEIGHT_PX * 4 ? 2_500 : 1_200;
        if (now - chatListStreamFlushAtRef.current < minGapMs) {
          return;
        }
        chatListStreamFlushAtRef.current = now;
        // Keep stream flush light — multi-page rank refresh is debounced separately.
        await loadChats({
          silent: true,
          allowAvatarResync: false,
          rankingRefreshPage: 1,
        });
        if (metrics.scrollY <= MESSAGE_ROW_HEIGHT_PX * 4) {
          scheduleChatListRankingRefreshRef.current?.();
        }
      } else {
        await loadChats({ silent: true, allowAvatarResync: false });
      }
    } finally {
      pollInFlightRef.current = false;
      const stillPending = streamRevisionPendingRef.current;
      // Only re-flush when a *newer* revision arrived during this fetch.
      // The old `stillPending > lastLive` check spun every 150ms whenever SSE
      // stayed ahead of the poll API — after voice-dialog close that froze the
      // chat preview so clicks never landed.
      if (
        stillPending != null &&
        pendingAtStart != null &&
        stillPending > pendingAtStart
      ) {
        if (streamLoadTimerRef.current == null) {
          streamLoadTimerRef.current = setTimeout(() => {
            streamLoadTimerRef.current = null;
            void flushStreamChatLoad();
          }, 2_500);
        }
      } else {
        streamRevisionPendingRef.current = null;
      }
    }
  }, [loadChats]);

  const onStreamRevision = useCallback(
    (revision: number) => {
      if (lastLiveRevisionRef.current != null && revision <= lastLiveRevisionRef.current) {
        return;
      }
      streamRevisionPendingRef.current = revision;
      unchangedPollStreakRef.current = 0;
      if (streamLoadTimerRef.current != null) {
        clearTimeout(streamLoadTimerRef.current);
      }
      // Busy chats emit revisions faster than a large apply can finish.
      // Slow down while the user is paging the catalog to avoid list flash.
      const scrollY = getChatListScrollMetrics().scrollY;
      const debounceMs = isVoiceDialogUiOpen()
        ? 12_000
        : scrollY > MESSAGE_ROW_HEIGHT_PX * 4
          ? 2_000
          : 450;
      streamLoadTimerRef.current = setTimeout(() => {
        streamLoadTimerRef.current = null;
        if (isVoiceDialogUiOpen()) {
          // Keep pending; flush on close via subscription below.
          logPageDisplay("messages_chats_stream_revision_deferred", {
            revision,
            reason: "voice_dialog_open",
          });
          return;
        }
        logPageDisplay("messages_chats_stream_revision", { revision });
        void flushStreamChatLoad();
      }, debounceMs);
    },
    [flushStreamChatLoad],
  );

  // Flush any deferred chat-list revision when the voice dialog closes.
  // Keep this delayed so Close paints first, but only one load — a tight
  // revision-retry loop after close froze the chat preview (unclickable).
  const voiceCloseFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return subscribeVoiceDialogUiOpen((open) => {
      if (open) {
        chatListApplyEpochRef.current += 1;
        if (voiceCloseFlushTimerRef.current != null) {
          clearTimeout(voiceCloseFlushTimerRef.current);
          voiceCloseFlushTimerRef.current = null;
        }
        // Stop a pending SSE→loadChats timer from firing mid-open longtask.
        if (streamLoadTimerRef.current != null) {
          clearTimeout(streamLoadTimerRef.current);
          streamLoadTimerRef.current = null;
        }
        return;
      }
      const pending = streamRevisionPendingRef.current;
      const deferredRows = deferredVoiceChatListRef.current;
      const needsSilentReload = deferredSilentChatLoadRef.current;
      if (pending == null && deferredRows == null && !needsSilentReload) return;
      if (
        pending != null &&
        lastLiveRevisionRef.current != null &&
        pending <= lastLiveRevisionRef.current &&
        deferredRows == null &&
        !needsSilentReload
      ) {
        streamRevisionPendingRef.current = null;
        return;
      }
      if (streamLoadTimerRef.current != null) {
        clearTimeout(streamLoadTimerRef.current);
        streamLoadTimerRef.current = null;
      }
      if (voiceCloseFlushTimerRef.current != null) {
        clearTimeout(voiceCloseFlushTimerRef.current);
      }
      logPageDisplay("messages_chats_stream_revision", {
        revision: pending,
        reason: "voice_dialog_closed_flush_scheduled",
        hasDeferredRows: deferredRows != null,
        needsSilentReload,
      });
      voiceCloseFlushTimerRef.current = setTimeout(() => {
        voiceCloseFlushTimerRef.current = null;
        if (isVoiceDialogUiOpen()) return;
        const stash = deferredVoiceChatListRef.current;
        if (stash != null) {
          deferredVoiceChatListRef.current = null;
          startTransition(() => {
            if (isVoiceDialogUiOpen()) {
              deferredVoiceChatListRef.current = stash;
              return;
            }
            setChats((prev) => {
              const next = mergeChatRows(prev, stash.rows);
              const changed = chatsChanged(prev, next);
              queueMicrotask(() => syncAuthenticatedHomeSelectedChat(next));
              if (stash.rows.length > 0) setGatewayWarming(false);
              if (changed) {
                logPageDisplay("messages_chats_poll_updated", {
                  count: next.length,
                  ...firstChatListLogFields(next),
                  poll: pollCountRef.current,
                  source: stash.json.source ?? null,
                  revision: stash.json.revision ?? null,
                  elapsedMs: Date.now() - stash.started,
                  missingPreviewCount: stash.missingPreviewCount,
                  missingAvatarFieldCount: stash.missingAvatarFieldCount,
                  reason: "voice_dialog_closed_deferred_rows",
                });
              }
              return changed ? next : prev;
            });
          });
        }
        if (deferredSilentChatLoadRef.current) {
          deferredSilentChatLoadRef.current = false;
          void loadChatsRef.current({ silent: true });
        }
        if (streamRevisionPendingRef.current == null) return;
        logPageDisplay("messages_chats_stream_revision", {
          revision: streamRevisionPendingRef.current,
          reason: "voice_dialog_closed_flush",
        });
        void flushStreamChatLoad();
      }, 400);
    });
  }, [flushStreamChatLoad]);

  useTelegramMessagesChatListStream({
    enabled: authReady && isTelegramMessagesConnected,
    getSinceRevision: () => lastLiveRevisionRef.current,
    onRevision: onStreamRevision,
    onStreamHealthyChange: (healthy) => {
      chatListStreamHealthyRef.current = healthy;
      if (healthy) {
        unchangedPollStreakRef.current = 0;
      }
    },
  });

  useEffect(() => {
    if (!isTelegramMessagesConnected) {
      setInitialChatListRevealed(false);
    }
  }, [isTelegramMessagesConnected]);

  useEffect(() => {
    if (
      !isTelegramMessagesConnected &&
      (userDisconnectedTelegramMessages || sessionTelegramMessagesConnected === false)
    ) {
      setChats([]);
      setChatListTotalCount(0);
      chatListTotalCountRef.current = 0;
      setChatListFetchingMore(false);
      resetChatListScrollPagination();
      setEmptyListConfirmed(false);
      setListBootstrapPending(false);
      setGatewayWarming(false);
      setLoading(false);
      setError(null);
    }
  }, [
    isTelegramMessagesConnected,
    sessionTelegramMessagesConnected,
    userDisconnectedTelegramMessages,
  ]);

  useEffect(() => {
    if (initialChatListRevealed) return;
    if (chatListSync?.stableTopReady === true && chatsCountRef.current > 0) {
      setInitialChatListRevealed(true);
      setGatewayWarming(false);
    }
  }, [chatListSync, initialChatListRevealed]);

  useEffect(() => {
    if (!authReady || !isTelegramMessagesConnected || initialChatListRevealed) return;
    // Safety valve only — prefer stableTopReady from the gateway.
    const id = setTimeout(() => {
      if (chatsCountRef.current > 0 && getChatListSyncStatus()?.stableTopReady === true) {
        setInitialChatListRevealed(true);
        setGatewayWarming(false);
        logPageDisplay("messages_chats_initial_reveal_timeout", {
          count: chatsCountRef.current,
        });
      }
    }, 8_000);
    return () => clearTimeout(id);
  }, [authReady, initialChatListRevealed, isTelegramMessagesConnected]);

  // Stable callbacks for bootstrap — do not re-run wipe/seed when loadChats
  // identity changes (that fired dual initial_mount resyncs and blanked the list).
  const triggerGatewayResyncRef = useRef(triggerGatewayResync);
  triggerGatewayResyncRef.current = triggerGatewayResync;
  const initialBootstrapEpochRef = useRef(0);

  useEffect(() => {
    if (!authReady) return;
    lastGatewayResyncRef.current = 0;
    pollCountRef.current = 0;
    if (isTelegramMessagesConnected) {
      setGatewayWarming(true);
      setListBootstrapPending(true);
      setInitialChatListRevealed(false);
      awaitingOrderedReseedRef.current = false;
      setChatListTotalCount(0);
      chatListTotalCountRef.current = 0;
      setChatListFetchingMore(false);
      resetChatListScrollPagination();
    } else {
      setListBootstrapPending(false);
      setGatewayWarming(false);
      setInitialChatListRevealed(false);
      awaitingOrderedReseedRef.current = false;
    }
    let cancelled = false;
    let paintPollTimer: ReturnType<typeof setTimeout> | null = null;
    const bootstrapEpoch = ++initialBootstrapEpochRef.current;

    const paintPoll = async () => {
      if (cancelled || !isTelegramMessagesConnected) return;
      if (isVoiceDialogUiOpen()) {
        deferredSilentChatLoadRef.current = true;
        return;
      }
      await loadChatsRef.current({ silent: true });
      if (cancelled) return;
      if (initialChatListRevealedRef.current) {
        setListBootstrapPending(false);
        return;
      }
      // Keep pulling until the ordered top page is ready — do not wait for
      // gateway resync to finish enriching the whole list.
      paintPollTimer = setTimeout(() => {
        void paintPoll();
      }, initialChatListRevealedRef.current ? 250 : 150);
    };

    void (async () => {
      // Poll once before resync — server restore may already have stableTopReady.
      // Eager resync wipes that cache and forces another ~30s TDLib walk in TMA.
      await loadChatsRef.current({ silent: true });
      if (cancelled) return;
      if (initialChatListRevealedRef.current) {
        setListBootstrapPending(false);
        return;
      }
      const syncAfterPoll = getChatListSyncStatus();
      const alreadySeeded =
        syncAfterPoll?.stableTopReady === true && chatsCountRef.current > 0;
      if (!alreadySeeded && bootstrapEpoch === initialBootstrapEpochRef.current) {
        void triggerGatewayResyncRef.current("initial_mount");
      }
      if (initialChatListRevealedRef.current) {
        setListBootstrapPending(false);
        return;
      }
      void paintPoll();
    })();

    return () => {
      cancelled = true;
      if (paintPollTimer != null) clearTimeout(paintPollTimer);
    };
  }, [authReady, isTelegramMessagesConnected]);

  useEffect(() => {
    if (!authReady || !isTelegramMessagesConnected) return;

    let cancelled = false;

    const runPoll = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (isVoiceDialogUiOpen()) return;
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      pollCountRef.current += 1;
      try {
        const loadedPages = getChatListLoadedPages();
        const partialCatalog = chatListScrollCatalogPartial(
          chatsCountRef.current,
          chatListTotalCountRef.current,
        );
        if (partialCatalog && loadedPages >= 1) {
          await loadChats({
            silent: true,
            allowAvatarResync: false,
            rankingRefreshPage: 1,
          });
        } else {
          await loadChats({ silent: true, allowAvatarResync: false });
        }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      const streamHealthy = CHAT_LIST_STREAM_ENABLED && chatListStreamHealthyRef.current;
      const delay = isVoiceDialogUiOpen()
        ? 15_000
        : streamHealthy
          ? MESSAGES_POLL_STREAM_FALLBACK_MS
          : unchangedPollStreakRef.current >= MESSAGES_POLL_SLOW_AFTER
            ? MESSAGES_POLL_SLOW_MS
            : MESSAGES_POLL_FAST_MS;
      pollTimerRef.current = setTimeout(() => {
        void runPoll().finally(scheduleNext);
      }, delay);
    };

    const onVisibilityChange = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      unchangedPollStreakRef.current = 0;
      if (pollTimerRef.current != null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      void runPoll().finally(scheduleNext);
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    scheduleNext();

    return () => {
      cancelled = true;
      if (pollTimerRef.current != null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (streamLoadTimerRef.current != null) {
        clearTimeout(streamLoadTimerRef.current);
        streamLoadTimerRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [authReady, isTelegramMessagesConnected, loadChats]);

  const handleChatPress = useCallback(
    (item: MessageChatRowData, source: "press" | "press_out" = "press") => {
      if (!chatSelectionEnabled) return;
      const openNow = Date.now();
      const guard = chatOpenGuardRef.current;
      if (
        guard &&
        guard.chatId === item.telegram_chat_id &&
        openNow - guard.at < 450
      ) {
        return;
      }
      chatOpenGuardRef.current = { chatId: item.telegram_chat_id, at: openNow };
      const hadSearchUi =
        chatListSearchFocused || chatListSearchQuery.trim().length > 0;
      if (hadSearchUi) {
        markChatListSearchRowPressPending();
      }
      const liveRow = chats.find(
        (row) => row.telegram_chat_id === item.telegram_chat_id,
      );
      const resolvedItem = liveRow ?? item;
      const sameChatAlreadyOpen =
        selectedChatRef.current?.telegram_chat_id === resolvedItem.telegram_chat_id;
      // Unlock autoplay in the same user gesture as chat selection so WebRTC
      // remote audio can play after auto listen-only join (useEffect is too late).
      if (resolvedItem.has_active_voice_chat) {
        unlockVoiceAutoplay();
      }
      logPageDisplay("messages_chat_row_press", {
        ...chatLogFields({
          chatId: resolvedItem.telegram_chat_id,
          peerUserId: resolvedItem.peer_user_id,
          title: resolvedItem.title,
        }),
        source,
      });
      logPageDisplay("messages_chat_open", chatLogFields({
        chatId: resolvedItem.telegram_chat_id,
        peerUserId: resolvedItem.peer_user_id,
        title: resolvedItem.title,
      }));
      openAuthenticatedHomeChatHistory(
        resolvedItem,
        hadSearchUi && sameChatAlreadyOpen ? { forceReload: true } : undefined,
      );
      if (readAuthenticatedHomeCompactChatLayoutSync()) {
        maybePushAuthenticatedHomeCompactChatRoute();
      }
      const runDeferredOpenWarmup = () => {
        if (hadSearchUi) {
          void rememberTelegramFoundChat(resolvedItem.telegram_chat_id);
          dismissChatListSearch();
        }
        setOpenChatFocusHold(
          resolvedItem.telegram_chat_id,
          compactChatLayout ? { holdMs: 2_000 } : undefined,
        );
        demoteQueuedNetworkFetches();
        clearQueuedNormalNetworkFetches();
        prefetchChatHistoryPriority(resolvedItem);
        void warmupTelegramChatSession(resolvedItem.telegram_chat_id);
        void import("./messages/messageChatAvatarPrefetch").then(
          ({ prefetchOpenChatListAvatar, prefetchOpenChatAvatars }) => {
            prefetchOpenChatListAvatar(resolvedItem);
            const cached = getCachedChatHistory(resolvedItem.telegram_chat_id);
            if (cached != null && cached.messages.length > 0) {
              prefetchOpenChatAvatars(resolvedItem, cached.messages, cached.chatKind);
            }
          },
        );
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(runDeferredOpenWarmup);
      } else {
        runDeferredOpenWarmup();
      }
    },
    [
      chatListSearchFocused,
      chatListSearchQuery,
      chatSelectionEnabled,
      chats,
      compactChatLayout,
      dismissChatListSearch,
    ],
  );

  const handleRowPrefetch = useCallback((item: MessageChatRowData) => {
    prefetchChatHistory(item);
  }, []);

  const handleClearSelection = useCallback(() => {
    if (!chatSelectionEnabled) return;
    setOpenChatFocusHold(null);
    clearAuthenticatedHomeSelectedChat();
  }, [chatSelectionEnabled]);

  const [chatListMenu, setChatListMenu] = useState<{
    row: MessageChatRowData;
    anchor: { x: number; y: number };
  } | null>(null);

  const handleOpenChatListMenu = useCallback(
    (row: MessageChatRowData, anchor: { x: number; y: number }) => {
      setChatListMenu({ row, anchor });
    },
    [],
  );

  const handleCloseChatListMenu = useCallback(() => {
    setChatListMenu(null);
  }, []);

  const handleToggleChatPinned = useCallback((row: MessageChatRowData) => {
    const chatId = row.telegram_chat_id;
    const nextPinned = !Boolean(row.is_pinned);
    setChatListMenu(null);
    setChats((prev) =>
      prev.map((item) =>
        item.telegram_chat_id === chatId
          ? {
              ...item,
              is_pinned: nextPinned,
              list_tier: nextPinned ? "pinned" : "positioned",
            }
          : item,
      ),
    );
    void toggleTelegramChatPinned(chatId, nextPinned).then((result) => {
      if (result.ok) {
        setChats((prev) =>
          prev.map((item) =>
            item.telegram_chat_id === chatId
              ? {
                  ...item,
                  is_pinned: result.is_pinned,
                  list_tier: result.is_pinned ? "pinned" : "positioned",
                }
              : item,
          ),
        );
        return;
      }
      setChats((prev) =>
        prev.map((item) =>
          item.telegram_chat_id === chatId
            ? { ...item, is_pinned: row.is_pinned, list_tier: row.list_tier }
            : item,
        ),
      );
    });
  }, []);

  const pinnedDragFromRef = useRef<number | null>(null);
  const pinnedDragStartYRef = useRef(0);
  const pinnedDragMovedRef = useRef(false);
  const pinnedOrderBeforeDragRef = useRef<number[] | null>(null);
  const pinnedOrderLiveRef = useRef<number[] | null>(null);
  const pinnedCommitPendingRef = useRef(false);

  const movePinnedChat = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setChats((prev) => {
      const sorted = sortChatRowsTierAware(prev);
      const pinned = sorted.filter((row) => resolveChatListTier(row) === "pinned");
      if (from >= pinned.length || to >= pinned.length) return prev;
      const nextPinned = [...pinned];
      const [moved] = nextPinned.splice(from, 1);
      if (!moved) return prev;
      nextPinned.splice(to, 0, moved);
      const ids = nextPinned.map((row) => row.telegram_chat_id);
      pinnedOrderLiveRef.current = ids;
      const base = Date.now();
      const orderById = new Map(
        ids.map((id, i) => [id, `${base}${String(Math.max(0, 9999 - i)).padStart(4, "0")}`]),
      );
      return prev.map((row) => {
        const nextOrder = orderById.get(row.telegram_chat_id);
        if (nextOrder == null) return row;
        return {
          ...row,
          is_pinned: true,
          list_tier: "pinned" as const,
          pin_order: nextOrder,
        };
      });
    });
    pinnedDragMovedRef.current = true;
  }, []);

  const applyOptimisticPinnedOrder = useCallback((pinnedIdsTopToBottom: number[]) => {
    const base = Date.now();
    const orderById = new Map(
      pinnedIdsTopToBottom.map((id, i) => [
        id,
        `${base}${String(Math.max(0, 9999 - i)).padStart(4, "0")}`,
      ]),
    );
    setChats((prev) =>
      prev.map((row) => {
        const nextOrder = orderById.get(row.telegram_chat_id);
        if (nextOrder == null) return row;
        return {
          ...row,
          is_pinned: true,
          list_tier: "pinned" as const,
          pin_order: nextOrder,
        };
      }),
    );
  }, []);

  const commitPinnedOrder = useCallback(() => {
    if (pinnedCommitPendingRef.current) return;
    const before = pinnedOrderBeforeDragRef.current;
    const current = pinnedOrderLiveRef.current;
    pinnedOrderBeforeDragRef.current = null;
    pinnedOrderLiveRef.current = null;
    if (!before || !current || !pinnedDragMovedRef.current) return;
    if (
      current.length === 0 ||
      (current.length === before.length && current.every((id, i) => id === before[i]))
    ) {
      return;
    }
    pinnedCommitPendingRef.current = true;
    void reorderTelegramPinnedChats(current, { archive: getMessagesArchiveOpen() }).then((result) => {
      pinnedCommitPendingRef.current = false;
      if (result.ok) return;
      applyOptimisticPinnedOrder(before);
    });
  }, [applyOptimisticPinnedOrder]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onMove = (event: PointerEvent) => {
      const from = pinnedDragFromRef.current;
      if (from == null) return;
      if (!pinnedDragMovedRef.current) {
        if (Math.abs(event.clientY - pinnedDragStartYRef.current) < 6) return;
        pinnedDragMovedRef.current = true;
      }
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const row = el?.closest?.("[data-pinned-index]") as HTMLElement | null;
      if (!row) return;
      const to = Number(row.dataset.pinnedIndex);
      if (!Number.isFinite(to) || to === from) return;
      movePinnedChat(from, to);
      pinnedDragFromRef.current = to;
    };
    const onUp = () => {
      if (pinnedDragFromRef.current == null) return;
      pinnedDragFromRef.current = null;
      commitPinnedOrder();
      window.setTimeout(() => {
        pinnedDragMovedRef.current = false;
      }, 0);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [commitPinnedOrder, movePinnedChat]);

  const handleViewChatProfile = useCallback(
    (row: MessageChatRowData) => {
      setChatListMenu(null);
      openProfileSheet(row);
    },
    [openProfileSheet],
  );

  const sortedChats = useMemo(() => {
    const tagged = chats.map((row) => {
      if (
        row.is_saved_messages ||
        !isSavedMessagesPeer(row.peer_user_id, connectedTelegramUserId)
      ) {
        return row;
      }
      return { ...row, is_saved_messages: true };
    });
    return sortChatRowsTierAware(tagged);
  }, [chats, connectedTelegramUserId]);
  const archiveOpen = useMessagesArchiveOpen();
  const mainSortedChats = useMemo(
    () => sortedChats.filter((row) => !row.in_archive),
    [sortedChats],
  );
  const archiveSortedChats = useMemo(
    () =>
      // Session scroll-up / archive view only — do not wait on archiveListReady
      // once rows are already in `chats` (ready can lag the payload).
      archiveRevealRequested || archiveOpen
        ? sortedChats.filter((row) => Boolean(row.in_archive))
        : [],
    [archiveOpen, archiveRevealRequested, sortedChats],
  );
  const archiveChatsPainted = archiveSortedChats.length > 0;
  const listModeChats = archiveOpen ? archiveSortedChats : mainSortedChats;
  const archiveFolderUnread = useMemo(
    () =>
      archiveSortedChats.reduce(
        (sum, row) => sum + (row.unread_count > 0 ? row.unread_count : 0),
        0,
      ),
    [archiveSortedChats],
  );
  const archiveFolderPreviewTitle = archiveSortedChats[0]?.title ?? null;
  const pinnedIndexByChatId = useMemo(() => {
    const map = new Map<number, number>();
    let pinnedIndex = 0;
    for (const row of listModeChats) {
      if (resolveChatListTier(row) !== "pinned") continue;
      map.set(row.telegram_chat_id, pinnedIndex);
      pinnedIndex += 1;
    }
    return map;
  }, [listModeChats]);
  const searchNeedle = useMemo(
    () => normalizeSearchNeedle(chatListSearchQuery),
    [chatListSearchQuery],
  );
  const recentsMode = chatListSearchFocused && !searchNeedle;
  const recentsPending = recentsMode && !recentSearchLoaded && recentSearchHits.length === 0;
  const listSearchActive = Boolean(searchNeedle) || recentsMode;
  /** Recents overlay still loading — keep the main list painted (Telegram Desktop). */
  const searchListReplacesMain = listSearchActive && !recentsPending;
  useEffect(() => {
    if (listSearchActive && archiveOpen) {
      setMessagesArchiveOpen(false);
    }
  }, [archiveOpen, listSearchActive]);
  useEffect(() => {
    if (!searchNeedle) {
      setCollapsedSearchSections({});
    }
  }, [searchNeedle]);

  useEffect(() => {
    if (!isTelegramMessagesConnected || !searchNeedle) {
      setRemoteSearchPeerUserIds([]);
      setRemoteDirectHits([]);
      setRemoteGlobalHits([]);
      setRemoteMessageHits([]);
      setRemoteMessageCount(0);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchTelegramChatListSearch(chatListSearchQuery, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) return;
        setRemoteSearchPeerUserIds(result.peerUserIds);
        setRemoteDirectHits(result.directChats);
        setRemoteGlobalHits(result.globalChats);
        setRemoteMessageHits(result.messageChats);
        setRemoteMessageCount(result.messageCount);
        logPageDisplay("messages_chat_list_search", {
          query: chatListSearchQuery.trim(),
          chatIdCount: result.chatIds.length,
          peerUserIdCount: result.peerUserIds.length,
          directCount: result.directChats.length,
          globalCount: result.globalChats.length,
          messageChatCount: result.messageChats.length,
          messageCount: result.messageCount,
          sampleTitles: result.chats
            .slice(0, 5)
            .map((row) => row.title)
            .join(" | "),
        });
      });
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [chatListSearchQuery, isTelegramMessagesConnected, searchNeedle]);

  useEffect(() => {
    if (!isTelegramMessagesConnected || !recentsMode) {
      if (!recentsMode) {
        setRecentSearchLoaded(false);
      }
      return;
    }
    const controller = new AbortController();
    setRecentSearchLoaded(false);
    void fetchTelegramChatListSearch("", controller.signal, { recent: true }).then((result) => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        if (result.error === "aborted") return;
        setRecentSearchHits([]);
        setRecentSearchLoaded(true);
        return;
      }
      setRecentSearchHits(result.chats);
      setRecentSearchLoaded(true);
    });
    return () => {
      controller.abort();
    };
  }, [isTelegramMessagesConnected, recentsMode]);

  const handleClearRecentSearch = useCallback(() => {
    void clearTelegramRecentFoundChats().then((ok) => {
      if (!ok) return;
      setRecentSearchHits([]);
      setRecentSearchLoaded(true);
    });
  }, []);

  const handleRemoveRecentSearch = useCallback(
    (chatId: number) => {
      void removeTelegramRecentFoundChat(chatId).then((ok) => {
        if (!ok) return;
        setRecentSearchHits((prev) => prev.filter((hit) => hit.chatId !== chatId));
      });
    },
    [],
  );

  const remoteDirectChatIdSet = useMemo(
    () => new Set(remoteDirectHits.map((hit) => hit.chatId)),
    [remoteDirectHits],
  );

  const cachedChatCount = chatListSync?.cachedCount ?? chats.length;

  const displayListItems = useMemo((): ChatListDisplayItem[] => {
    // Search/recents use column-reverse: first array item sits nearest the search field (bottom).
    if (recentsMode && !recentsPending) {
      const liveById = new Map(sortedChats.map((row) => [row.telegram_chat_id, row]));
      const items: ChatListDisplayItem[] = [];
      // column-reverse: footer first in array → nearest the search field (visual bottom).
      if (recentSearchLoaded && recentSearchHits.length > 0) {
        items.push({ kind: "recentsFooter", key: "recents-footer" });
      }
      for (const hit of recentSearchHits) {
        items.push({
          kind: "chat",
          key: `chat-${hit.chatId}`,
          row: resolveSearchHitRow(hit, liveById, connectedTelegramUserId),
        });
      }
      return items;
    }
    if (!searchNeedle) {
      if (archiveOpen) {
        if (archiveSortedChats.length > 0) {
          return archiveSortedChats.map((row) => ({
            kind: "chat" as const,
            key: `chat-${row.telegram_chat_id}`,
            row,
          }));
        }
        // Keep a reserved loading row until archive dialogs paint — never flash empty.
        if (!archiveEmptyConfirmed) {
          return [
            {
              kind: "archiveFolder" as const,
              key: "archive-folder",
              previewTitle: null,
              unreadCount: 0,
              loading: true,
            },
          ];
        }
        return [];
      }
      const items: ChatListDisplayItem[] = [];
      if (archiveSortedChats.length > 0) {
        items.push({
          kind: "archiveFolder",
          key: "archive-folder",
          previewTitle: archiveFolderPreviewTitle,
          unreadCount: archiveFolderUnread,
        });
      } else if (
        // Only after the user scrolls up — never on first paint.
        // Stay up until archived dialogs are in `chats`, or a ready snapshot
        // proved the archive is empty. Dropping the row on archiveListReady
        // alone lets the list shrink, then grow when the payload paints.
        archiveRevealRequested &&
        !archiveEmptyConfirmed
      ) {
        items.push({
          kind: "archiveFolder",
          key: "archive-folder",
          previewTitle: null,
          unreadCount: 0,
          loading: true,
        });
      }
      for (const row of mainSortedChats) {
        items.push({
          kind: "chat",
          key: `chat-${row.telegram_chat_id}`,
          row,
        });
      }
      const serverTotal = Math.max(chatListTotalCount, cachedChatCount);
      const catalogPartial = chatListScrollCatalogPartial(mainSortedChats.length, serverTotal);
      const catalogScrollHasMore =
        catalogPartial ||
        (serverTotal > 0 &&
          getChatListLoadedPages() * CHAT_LIST_API_PAGE_SIZE < serverTotal &&
          chatListScrollHasMore());
      if (
        catalogScrollHasMore &&
        (chatListFetchingMore || isChatListScrollPageFetchInFlight())
      ) {
        items.push({ kind: "catalogLoading", key: "catalog-loading-tail" });
      }
      return items;
    }

    const liveById = new Map(sortedChats.map((row) => [row.telegram_chat_id, row]));
    const directPeerIdSet = new Set(remoteSearchPeerUserIds);
    for (const hit of remoteDirectHits) {
      if (hit.peerUserId != null && Number.isFinite(hit.peerUserId) && hit.peerUserId !== 0) {
        directPeerIdSet.add(Math.trunc(hit.peerUserId));
      }
    }

    const directIds = new Set<number>();
    const directRows: MessageChatRowData[] = [];
    const localDirect = sortedChats
      .filter((row) => {
        if (chatMatchesLocalSearch(row, searchNeedle)) return true;
        if (remoteDirectChatIdSet.has(row.telegram_chat_id)) return true;
        if (
          row.peer_user_id != null &&
          Number.isFinite(row.peer_user_id) &&
          directPeerIdSet.has(Math.trunc(row.peer_user_id))
        ) {
          return true;
        }
        return false;
      })
      .map((row, index) => ({
        row,
        index,
        rank: chatSearchRank(
          row,
          searchNeedle,
          remoteDirectChatIdSet.has(row.telegram_chat_id) ||
            (row.peer_user_id != null &&
              directPeerIdSet.has(Math.trunc(row.peer_user_id))),
        ),
      }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.row);

    for (const row of localDirect) {
      if (directIds.has(row.telegram_chat_id)) continue;
      directIds.add(row.telegram_chat_id);
      directRows.push(row);
    }
    for (const hit of remoteDirectHits) {
      if (directIds.has(hit.chatId)) continue;
      directIds.add(hit.chatId);
      directRows.push(resolveSearchHitRow(hit, liveById, connectedTelegramUserId));
    }

    const globalRows = remoteGlobalHits
      .filter((hit) => !directIds.has(hit.chatId))
      .map((hit) => resolveSearchHitRow(hit, liveById, connectedTelegramUserId));
    const globalIdSet = new Set(globalRows.map((row) => row.telegram_chat_id));

    const messageRows = remoteMessageHits
      .filter((hit) => !directIds.has(hit.chatId) && !globalIdSet.has(hit.chatId))
      .map((hit) => resolveSearchHitRow(hit, liveById, connectedTelegramUserId));

    const items: ChatListDisplayItem[] = [];
    // column-reverse: first item sits nearest the search field (visual bottom).
    // Messages-found chrome belongs there so results read upward.
    const foundCount = Math.max(
      0,
      Number.isFinite(remoteMessageCount) ? remoteMessageCount : 0,
      messageRows.length,
    );
    if (foundCount > 0 || messageRows.length > 0 || globalRows.length > 0 || directRows.length > 0) {
      items.push({
        kind: "messagesFooter",
        key: "search-messages-footer",
        count: foundCount,
      });
    }
    for (const row of directRows) {
      items.push({ kind: "chat", key: `chat-${row.telegram_chat_id}`, row });
    }
    if (globalRows.length > 0) {
      const globalOpen = collapsedSearchSections.global !== true;
      items.push({
        kind: "sectionHeader",
        key: "search-global-header",
        sectionId: "global",
        title: t("messages.search.globalResults"),
      });
      if (globalOpen) {
        for (const row of globalRows) {
          items.push({ kind: "chat", key: `chat-${row.telegram_chat_id}`, row });
        }
      }
    }
    for (const row of messageRows) {
      items.push({ kind: "chat", key: `chat-msg-${row.telegram_chat_id}`, row });
    }
    return items;
  }, [
    archiveEmptyConfirmed,
    archiveFolderPreviewTitle,
    archiveFolderUnread,
    archiveOpen,
    archiveRevealRequested,
    archiveSortedChats,
    cachedChatCount,
    chatListFetchingMore,
    chatListTotalCount,
    chatListSync?.archiveListReady,
    collapsedSearchSections,
    connectedTelegramUserId,
    mainSortedChats,
    recentsMode,
    recentsPending,
    recentSearchHits,
    recentSearchLoaded,
    remoteDirectChatIdSet,
    remoteDirectHits,
    remoteGlobalHits,
    remoteMessageCount,
    remoteMessageHits,
    searchNeedle,
    sortedChats,
    t,
  ]);

  // Virtualization paints the visible band; rows grow as the user scrolls near the
  // end (same model as swap jettons catalog + ChooseCurrencyTable onEndReached).
  const {
    viewportCount: chatListRevealCount,
    expandViewport: expandChatListReveal,
    canExpandViewport: canExpandChatListReveal,
  } = useChatListViewport(displayListItems.length, { autoReveal: true });

  const revealedDisplayListItems = useMemo(() => {
    if (chatListRevealCount >= displayListItems.length) return displayListItems;
    return displayListItems.slice(0, Math.max(0, chatListRevealCount));
  }, [chatListRevealCount, displayListItems]);

  const displayChats = useMemo(
    () =>
      revealedDisplayListItems
        .filter((item): item is Extract<ChatListDisplayItem, { kind: "chat" }> => item.kind === "chat")
        .map((item) => item.row),
    [revealedDisplayListItems],
  );

  const chatListRowStride = chatListRowStridePx(wideListChrome);
  const chatListShellTopInset = chatListShellTopInsetPx(wideListChrome);

  useLayoutEffect(() => {
    const anchor = chatListAppendRestoreAnchorRef.current;
    if (!anchor) return;
    restoreChatListScrollPreserveAnchor(anchor);
    chatListAppendRestoreAnchorRef.current = null;
    chatListVirtualStickyFreezeRef.current = null;
  }, [chats.length, revealedDisplayListItems.length]);

  useEffect(() => {
    return subscribeChatListScrollMetrics(() => {
      if (chatListScrollRafRef.current != null) return;
      chatListScrollRafRef.current = requestAnimationFrame(() => {
        chatListScrollRafRef.current = null;
        setChatListScrollTick((tick) => tick + 1);
      });
    });
  }, []);

  const chatListScrollMetrics = getChatListScrollMetrics();
  const chatListEffectiveLayoutH =
    chatListScrollMetrics.layoutH > 0 ? chatListScrollMetrics.layoutH : 480;
  const catalogScrollExtent = useMemo(() => {
    if (searchListReplacesMain || listSearchActive || archiveOpen) {
      return { phantomRows: 0, tailLoading: false, scrollHasMore: false };
    }
    const serverTotal = Math.max(chatListTotalCount, cachedChatCount);
    const loadedChatCount = mainSortedChats.length;
    const partial = chatListScrollCatalogPartial(loadedChatCount, serverTotal);
    const scrollHasMore =
      partial ||
      (serverTotal > 0 &&
        getChatListLoadedPages() * CHAT_LIST_API_PAGE_SIZE < serverTotal &&
        chatListScrollHasMore());
    const tailLoading =
      scrollHasMore && (chatListFetchingMore || isChatListScrollPageFetchInFlight());
    const basePhantomRows =
      scrollHasMore
        ? chatListCatalogPhantomRowCount(loadedChatCount, serverTotal)
        : 0;
    // While a page is in flight, ensure at least one virtual row past the loaded tail
    // (loader). Never *replace* the prefetch runway with that single row — collapsing
    // totalCount during fetch destabilizes maxScrollY, the virtual window (start/end flip),
    // and remounts visible rows (avatar flashes in logs).
    const phantomRows = Math.max(basePhantomRows, tailLoading ? 1 : 0);
    return { phantomRows, tailLoading, scrollHasMore };
  }, [
    archiveOpen,
    cachedChatCount,
    chatListFetchingMore,
    chatListTotalCount,
    listSearchActive,
    mainSortedChats.length,
    searchListReplacesMain,
  ]);
  const chatListVirtualTotalCountRaw =
    revealedDisplayListItems.length + catalogScrollExtent.phantomRows;
  const chatListVirtualTotalCount = useMemo(() => {
    if (searchListReplacesMain || listSearchActive || archiveOpen) {
      chatListVirtualTotalBottomPinRef.current = null;
      return chatListVirtualTotalCountRaw;
    }
    const layoutH = chatListEffectiveLayoutH;
    if (layoutH <= 0 || chatListVirtualTotalCountRaw <= 0) {
      chatListVirtualTotalBottomPinRef.current = null;
      return chatListVirtualTotalCountRaw;
    }
    const contentTopInsetPx =
      chatListShellTopInset + (chatListScrollMetrics.contentTopInsetPx ?? 0);
    const totalHeight =
      contentTopInsetPx + chatListVirtualTotalCountRaw * chatListRowStride;
    const maxScrollY = Math.max(0, totalHeight - layoutH);
    const tailSlackPx = chatListRowStride + 4;
    const atCatalogTail =
      maxScrollY <= 0
        ? chatListScrollMetrics.scrollY <= tailSlackPx
        : chatListScrollMetrics.scrollY >= maxScrollY - tailSlackPx;
    if (!atCatalogTail) {
      chatListVirtualTotalBottomPinRef.current = null;
      return chatListVirtualTotalCountRaw;
    }
    const pinned = chatListVirtualTotalBottomPinRef.current;
    const next =
      pinned == null
        ? chatListVirtualTotalCountRaw
        : Math.max(chatListVirtualTotalCountRaw, pinned);
    chatListVirtualTotalBottomPinRef.current = next;
    return next;
  }, [
    archiveOpen,
    chatListEffectiveLayoutH,
    chatListRowStride,
    chatListScrollMetrics.contentTopInsetPx,
    chatListScrollMetrics.scrollY,
    chatListShellTopInset,
    chatListVirtualTotalCountRaw,
    listSearchActive,
    searchListReplacesMain,
  ]);
  const chatListVirtualWindow = useMemo(() => {
    if (searchListReplacesMain) {
      return {
        enabled: false,
        startIndex: 0,
        endIndex: Math.max(0, revealedDisplayListItems.length - 1),
        topSpacerPx: 0,
        bottomSpacerPx: 0,
      };
    }
    const stickyFreeze = chatListVirtualStickyFreezeRef.current;
    const stickyForWindow = stickyFreeze ?? chatListVirtualStickyRef.current;
    const next = resolveChatListVirtualWindow(chatListVirtualTotalCount, {
      scrollY: chatListScrollMetrics.scrollY,
      layoutH: chatListEffectiveLayoutH,
    }, {
      rowStridePx: chatListRowStride,
      contentTopInsetPx: chatListShellTopInset + (chatListScrollMetrics.contentTopInsetPx ?? 0),
      stickyWindow: searchListReplacesMain ? undefined : stickyForWindow,
    });
    if (!stickyFreeze) {
      chatListVirtualStickyRef.current = {
        startIndex: next.startIndex,
        endIndex: next.endIndex,
      };
    }
    return next;
  }, [
    chatListRowStride,
    chatListScrollTick,
    chatListShellTopInset,
    chatListVirtualTotalCount,
    chatListEffectiveLayoutH,
    chatListScrollMetrics.scrollY,
    revealedDisplayListItems.length,
    searchListReplacesMain,
  ]);
  chatListVirtualWindowRef.current = chatListVirtualWindow;

  const chatListVirtualLogRef = useRef({
    enabled: false,
    startIndex: 0,
    endIndex: 0,
    scrollY: 0,
    totalCount: 0,
    revealCount: 0,
  });
  useEffect(() => {
    const prev = chatListVirtualLogRef.current;
    const changed =
      prev.enabled !== chatListVirtualWindow.enabled ||
      prev.startIndex !== chatListVirtualWindow.startIndex ||
      prev.endIndex !== chatListVirtualWindow.endIndex ||
      Math.abs(prev.scrollY - chatListScrollMetrics.scrollY) > chatListRowStride ||
      prev.totalCount !== chatListVirtualTotalCount ||
      prev.revealCount !== chatListRevealCount;
    if (!changed) return;
    chatListVirtualLogRef.current = {
      enabled: chatListVirtualWindow.enabled,
      startIndex: chatListVirtualWindow.startIndex,
      endIndex: chatListVirtualWindow.endIndex,
      scrollY: chatListScrollMetrics.scrollY,
      totalCount: chatListVirtualTotalCount,
      revealCount: chatListRevealCount,
    };
    logPageDisplay("messages_chat_list_virtual_window", {
      enabled: chatListVirtualWindow.enabled,
      startIndex: chatListVirtualWindow.startIndex,
      endIndex: chatListVirtualWindow.endIndex,
      topSpacerPx: chatListVirtualWindow.topSpacerPx,
      bottomSpacerPx: chatListVirtualWindow.bottomSpacerPx,
      scrollY: chatListScrollMetrics.scrollY,
      layoutH: chatListEffectiveLayoutH,
      totalCount: listSearchActive ? revealedDisplayListItems.length : displayListItems.length,
      loadedCount: displayChats.length,
      revealCount: chatListRevealCount,
      rowStridePx: chatListRowStride,
    });
  }, [
    chatListEffectiveLayoutH,
    chatListRevealCount,
    chatListRowStride,
    chatListScrollMetrics.scrollY,
    chatListVirtualTotalCount,
    chatListVirtualWindow.bottomSpacerPx,
    chatListVirtualWindow.enabled,
    chatListVirtualWindow.endIndex,
    chatListVirtualWindow.startIndex,
    chatListVirtualWindow.topSpacerPx,
    displayChats.length,
    listSearchActive,
    revealedDisplayListItems.length,
    sortedChats.length,
  ]);

  const positionedComplete = chatListSync?.positionedComplete === true;
  const tier3Available = chatListSync?.tier3Available === true;
  const tier3InProgress = chatListSync?.tier3InProgress === true;
  const syncInProgress = chatListSync?.inProgress === true;
  // Telegram Desktop / WebK: page until the main list is complete, then optional
  // supplementary tail. Do NOT use "unpositioned row count" as a missing-page signal.
  const listBehindCache = chats.length < cachedChatCount;
  const hasMoreChatPages =
    chatListTotalCount > 0 &&
    getChatListLoadedPages() * CHAT_LIST_API_PAGE_SIZE < chatListTotalCount &&
    chatListScrollHasMore();
  const needsPositionedPage = !positionedComplete || (listBehindCache && syncInProgress);
  const needsTier3Page = positionedComplete && !listBehindCache && tier3Available;
  const mayHaveMoreOnServer =
    chatListGatewayLoadMoreAllowed(displayChats.length, Math.max(chatListTotalCount, cachedChatCount)) &&
    (needsPositionedPage || needsTier3Page || syncInProgress || tier3InProgress);
  const catalogPartial = chatListScrollCatalogPartial(
    displayChats.length,
    Math.max(chatListTotalCount, cachedChatCount),
  );
  const showBottomLoader =
    !searchNeedle &&
    !recentsMode &&
    !catalogScrollExtent.tailLoading &&
    (chatListFetchingMore ||
      (!catalogPartial && (syncInProgress || tier3InProgress)) ||
      (chatListAtBottomRef.current && (hasMoreChatPages || mayHaveMoreOnServer)));

  const visibleListItems = chatListVirtualWindow.enabled
    ? revealedDisplayListItems.slice(
        Math.min(chatListVirtualWindow.startIndex, revealedDisplayListItems.length),
        Math.min(revealedDisplayListItems.length, chatListVirtualWindow.endIndex + 1),
      )
    : revealedDisplayListItems;
  const visibleChatStartIndex = chatListVirtualWindow.enabled
    ? chatListVirtualWindow.startIndex
    : 0;
  const visibleChats = visibleListItems
    .filter((item): item is Extract<ChatListDisplayItem, { kind: "chat" }> => item.kind === "chat")
    .map((item) => item.row);
  const visibleChatIdsKey = visibleChats
    .map((row) => row.telegram_chat_id)
    .join(",");
  /**
   * Boost avatar fetch for the visual top of the viewport first.
   * Default list is top→bottom (index 0 = top). Search/recents use column-reverse
   * (last indices = visual top).
   */
  const prioritizeAvatarChatIds = useMemo(() => {
    const ids = new Set<number>();
    if (selectedChatId != null && Number.isFinite(selectedChatId)) {
      ids.add(selectedChatId);
    }
    for (const row of visibleChats) {
      ids.add(row.telegram_chat_id);
    }
    return ids;
  }, [selectedChatId, visibleChatIdsKey]);

  // tdesktop: keep neighbors warm so the next switch paints from cache.
  useEffect(() => {
    if (!isTelegramMessagesConnected || visibleChats.length === 0) return;
    if (isVoiceDialogUiOpen()) return;
    // Live voice on the open chat already runs SSE/soft-poll + WebRTC — neighbor
    // history storms competed for the main thread (logs: prefetch_ok mid-freeze).
    const selected = visibleChats.find((row) => row.telegram_chat_id === selectedChatId);
    if (selected?.has_active_voice_chat) return;
    prefetchVisibleChatNeighbors(visibleChats, selectedChatId, {
      radius: 1,
      visualTopAtEnd: searchListReplacesMain,
    });
    // visibleChats identity changes every render; key on ids + selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleChatIdsKey
  }, [isTelegramMessagesConnected, searchListReplacesMain, selectedChatId, visibleChatIdsKey]);

  useEffect(() => {
    setChatListBottomLoaderActive(showBottomLoader);
    return () => {
      setChatListBottomLoaderActive(false);
    };
  }, [showBottomLoader]);

  const prevChatListSyncRef = useRef(false);
  useEffect(() => {
    const inProgress = chatListSync?.inProgress === true;
    if (prevChatListSyncRef.current && !inProgress) {
      const nextTotal = Math.max(
        chatListTotalCountRef.current,
        chatListSync?.cachedCount ?? 0,
      );
      if (nextTotal > chatListTotalCountRef.current) {
        chatListTotalCountRef.current = nextTotal;
        setChatListTotalCount(nextTotal);
      }
    }
    prevChatListSyncRef.current = inProgress;
  }, [chatListSync?.cachedCount, chatListSync?.inProgress]);

  const queueChatListScrollPageFetch = useCallback(() => {
    const prev = chatListFetchQueuedRef.current;
    chatListFetchQueuedRef.current = {
      allowAvatarResync: prev?.allowAvatarResync,
      silent: true,
      forceFull: false,
      priority: false,
      fromScroll: true,
      rankingRefreshPage: prev?.rankingRefreshPage,
    };
  }, []);

  const requestChatListNextPage = useCallback(() => {
    if (listSearchActive) return;
    if (isVoiceDialogUiOpen()) return;
    if (isOpenChatFocusHoldActive()) return;
    if (archiveRevealPendingRef.current) return;
    if (chatListFetchBusyRef.current || chatListFetchingMore) {
      queueChatListScrollPageFetch();
      return;
    }
    if (isChatListScrollPageFetchInFlight()) {
      queueChatListScrollPageFetch();
      return;
    }
    const serverTotal = Math.max(chatListTotalCount, cachedChatCount);
    requestChatListCatalogNextPage(chatsCountRef.current, serverTotal, {
      allowAvatarResync: true,
    });
  }, [
    cachedChatCount,
    chatListFetchingMore,
    chatListTotalCount,
    listSearchActive,
    queueChatListScrollPageFetch,
  ]);

  const shouldLoadChatListCatalogFromScroll = useCallback(() => {
    if (listSearchActive || searchListReplacesMain) return false;
    if (!initialChatListRevealed) return false;
    if (isVoiceDialogUiOpen() || archiveRevealPendingRef.current) return false;
    if (isOpenChatFocusHoldActive()) return false;
    const serverTotal = Math.max(chatListTotalCount, cachedChatCount);
    if (serverTotal <= 0 && !chatListScrollHasMore()) return false;
    const partialCatalog = chatListScrollCatalogPartial(
      chatsCountRef.current,
      serverTotal,
    );
    if (!partialCatalog && !chatListScrollHasMore()) return false;
    const metrics = getChatListScrollMetrics();
    const layoutH =
      metrics.layoutH > 0 ? metrics.layoutH : chatListEffectiveLayoutH;
    if (layoutH <= 0) return false;
    const listShellTop =
      chatListShellTopInset + (metrics.contentTopInsetPx ?? 0);
    const tailWithinPrefetch = chatListCatalogTailWithinPrefetch(
      chatListVirtualTotalCount,
      mainSortedChats.length,
      { scrollY: metrics.scrollY, layoutH },
      {
        rowStridePx: chatListRowStride,
        contentTopInsetPx: listShellTop,
        tailLeadRows: LIST_SCROLL_CATALOG_TAIL_LEAD_ROWS,
      },
    );
    const listFitsViewport =
      metrics.contentH > 0 && metrics.contentH <= layoutH + 12;
    return tailWithinPrefetch || listFitsViewport;
  }, [
    cachedChatCount,
    chatListEffectiveLayoutH,
    chatListRowStride,
    chatListShellTopInset,
    mainSortedChats.length,
    chatListTotalCount,
    chatListVirtualTotalCount,
    initialChatListRevealed,
    listSearchActive,
    searchListReplacesMain,
  ]);

  const tryLoadChatListCatalogFromScroll = useCallback(() => {
    if (!shouldLoadChatListCatalogFromScroll()) return;
    const serverTotal = Math.max(chatListTotalCount, cachedChatCount);
    const partialCatalog = chatListScrollCatalogPartial(
      chatsCountRef.current,
      serverTotal,
    );
    if (partialCatalog || chatListScrollHasMore()) {
      requestChatListNextPage();
      return;
    }
    if (
      chatListGatewayLoadMoreAllowed(chatsCountRef.current, serverTotal) &&
      (needsPositionedPage || needsTier3Page)
    ) {
      if (needsPositionedPage) {
        void requestLoadMoreChats("positioned");
      } else if (needsTier3Page) {
        void requestLoadMoreChats("unpositioned");
      }
    }
  }, [
    cachedChatCount,
    chatListTotalCount,
    needsPositionedPage,
    needsTier3Page,
    requestChatListNextPage,
    requestLoadMoreChats,
    shouldLoadChatListCatalogFromScroll,
  ]);

  const handleChatListNearBottom = useCallback(() => {
    chatListAtBottomRef.current = true;
    if (canExpandChatListReveal) {
      expandChatListReveal();
    }
    tryLoadChatListCatalogFromScroll();
  }, [canExpandChatListReveal, expandChatListReveal, tryLoadChatListCatalogFromScroll]);

  useEffect(() => {
    tryLoadChatListCatalogFromScroll();
  }, [
    chatListScrollTick,
    chatListVirtualTotalCount,
    chatListTotalCount,
    cachedChatCount,
    initialChatListRevealed,
    tryLoadChatListCatalogFromScroll,
  ]);

  useEffect(() => {
    setChatListNearBottomHandler(handleChatListNearBottom);
    return () => {
      setChatListNearBottomHandler(null);
    };
  }, [handleChatListNearBottom]);

  const handleChatListNearTop = useCallback(() => {
    if (listSearchActive || archiveOpen) return;
    if (isVoiceDialogUiOpen()) return;
    archiveScrollArmedRef.current = true;
    setArchiveScrollArmed(true);
    archiveRevealPendingRef.current = true;
    setArchiveEmptyConfirmed(false);
    setArchiveRevealRequested(true);
    // Skip sync only when archived dialogs are already in client state (not a stale
    // ready flag left over from a prior gateway session / list reseed).
    if (sortedChats.some((row) => Boolean(row.in_archive))) {
      archiveRevealPendingRef.current = false;
      return;
    }
    archivePaintFetchStartedRef.current = false;
    void requestArchiveChats();
  }, [
    archiveOpen,
    listSearchActive,
    requestArchiveChats,
    sortedChats,
  ]);

  const handleOpenArchive = useCallback(() => {
    logPageDisplay("messages_archive_open", {
      painted: archiveSortedChats.length,
      emptyConfirmed: archiveEmptyConfirmed,
      archiveListReady: chatListSync?.archiveListReady === true,
    });
    setArchiveEmptyConfirmed(false);
    archiveRevealPendingRef.current = true;
    setArchiveRevealRequested(true);
    setMessagesArchiveOpen(true);
    if (sortedChats.some((row) => Boolean(row.in_archive))) {
      archiveRevealPendingRef.current = false;
      return;
    }
    archivePaintFetchStartedRef.current = false;
    void requestArchiveChats();
  }, [
    archiveEmptyConfirmed,
    archiveSortedChats.length,
    chatListSync?.archiveListReady,
    requestArchiveChats,
    sortedChats,
  ]);

  useEffect(() => {
    if (chatListVirtualWindow.startIndex > 0) {
      archiveScrollArmedRef.current = true;
      setArchiveScrollArmed(true);
    }
  }, [chatListVirtualWindow.startIndex]);

  useEffect(() => {
    const armFromMetrics = () => {
      const metrics = getChatListScrollMetrics();
      if (metrics.scrollY > 64) {
        archiveScrollArmedRef.current = true;
        setArchiveScrollArmed(true);
      }
    };
    armFromMetrics();
    return subscribeChatListScrollMetrics(armFromMetrics);
  }, []);

  useEffect(() => {
    setChatListNearTopHandler(handleChatListNearTop);
    return () => {
      setChatListNearTopHandler(null);
    };
  }, [handleChatListNearTop]);
  // Poll only while the gateway archive sync is in flight. Once ready, a single
  // urgent loadChats paints the folder — keep polling past ready forceFull-thrashes
  // the list and unsticks Feed/Messages + Archived chrome.
  useEffect(() => {
    if (!archiveRevealRequested) return;
    if (chatListSync?.archiveListReady === true) return;
    if (listSearchActive) return;
    const id = setInterval(() => {
      void requestArchiveChats();
    }, 1200);
    return () => {
      clearInterval(id);
    };
  }, [
    archiveRevealRequested,
    chatListSync?.archiveListReady,
    listSearchActive,
    requestArchiveChats,
  ]);

  // Ready arrived (SSE / load-more) before the chat payload — one paint fetch, not a loop.
  useEffect(() => {
    if (!archiveRevealRequested) return;
    if (chatListSync?.archiveListReady !== true) return;
    if (archiveEmptyConfirmed || archiveChatsPainted) {
      archiveRevealPendingRef.current = false;
      archivePaintFetchStartedRef.current = false;
      return;
    }
    if (listSearchActive) return;
    if (isVoiceDialogUiOpen()) return;
    if (!archivePaintFetchStartedRef.current) {
      archivePaintFetchStartedRef.current = true;
      void requestArchiveChats();
    }
    const retry = setTimeout(() => {
      archivePaintFetchStartedRef.current = false;
      void requestArchiveChats();
    }, 8_000);
    return () => clearTimeout(retry);
  }, [
    archiveChatsPainted,
    archiveEmptyConfirmed,
    archiveRevealRequested,
    chatListSync?.archiveListReady,
    listSearchActive,
    requestArchiveChats,
  ]);

  // Ordered reseed (stable top dropped) — hide folder until the next scroll-up.
  useEffect(() => {
    if (chatListSync != null && chatListSync.stableTopReady === false) {
      archiveRevealPendingRef.current = false;
      archivePaintFetchStartedRef.current = false;
      setArchiveRevealRequested(false);
      setArchiveEmptyConfirmed(false);
      archiveScrollArmedRef.current = false;
      setArchiveScrollArmed(false);
      resetChatListArchiveRevealLatch();
    }
  }, [chatListSync?.stableTopReady]);

  useEffect(() => {
    if (!listSearchActive) return;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        invokeChatListSearchScrollToEnd();
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      if (innerFrame) cancelAnimationFrame(innerFrame);
    };
  }, [
    listSearchActive,
    searchNeedle,
    recentsMode,
    recentSearchLoaded,
  ]);

  const renderListItems = (items: ChatListDisplayItem[], startIndex: number) => (
    <>
      {chatListVirtualWindow.enabled && chatListVirtualWindow.topSpacerPx > 0 ? (
        <View style={{ height: chatListVirtualWindow.topSpacerPx }} />
      ) : null}
      {!listSearchActive && startIndex === 0 ? (
        <ChatListTopSentinel
          enabled={
            archiveScrollArmed &&
            !archiveOpen &&
            !archiveRevealRequested &&
            listModeChats.length > 0
          }
          onNearTop={handleChatListNearTop}
        />
      ) : null}
      {items.map((item, index) => {
        const absoluteIndex = startIndex + index;
        const lastRevealed = revealedDisplayListItems[revealedDisplayListItems.length - 1];
        // column-reverse: first item is nearest the search field (visual bottom).
        const isVisualBottomEdge = searchListReplacesMain
          ? absoluteIndex === 0
          : lastRevealed?.kind === "catalogLoading"
            ? false
            : absoluteIndex === revealedDisplayListItems.length - 1 && !showBottomLoader;
        if (item.kind === "archiveFolder") {
          return (
            <MessageChatListArchiveFolderRow
              key={item.key}
              previewTitle={item.previewTitle}
              unreadCount={item.unreadCount}
              colors={colors}
              isLast={isVisualBottomEdge}
              loading={item.loading === true}
              onPress={handleOpenArchive}
            />
          );
        }
        if (item.kind === "sectionHeader") {
          const sectionOpen = collapsedSearchSections[item.sectionId] !== true;
          // 1px between closed section dividers; slightly more when open.
          const gapPx = sectionOpen ? 2 : 1;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ expanded: sectionOpen }}
              onPress={() => {
                setCollapsedSearchSections((prev) => ({
                  ...prev,
                  [item.sectionId]: sectionOpen,
                }));
              }}
              style={{
                backgroundColor: colors.undercover,
                paddingVertical: 8,
                paddingHorizontal: layout.contentSideInsetPx,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                // column-reverse: marginTop separates toward the next section above.
                marginBottom: listSearchActive ? 0 : 2,
                marginTop: listSearchActive ? gapPx : 0,
              }}
            >
              <SearchSectionChevron
                open={sectionOpen}
                color={sectionOpen ? colors.primary : colors.secondary}
              />
              <Text
                style={{
                  color: sectionOpen ? colors.primary : colors.secondary,
                  fontSize: 13,
                  lineHeight: 18,
                  flex: 1,
                }}
              >
                {item.title}
              </Text>
            </Pressable>
          );
        }
        if (item.kind === "catalogLoading") {
          return (
            <MessageChatListCatalogLoadingRow
              key={item.key}
              colors={colors}
              isLast={!searchListReplacesMain}
            />
          );
        }
        if (item.kind === "recentsFooter") {
          return (
            <View
              key={item.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                backgroundColor: colors.undercover,
                borderTopWidth: 1,
                borderTopColor: colors.highlight,
                paddingVertical: 8,
                paddingHorizontal: layout.contentSideInsetPx,
                // Nearest the search field in column-reverse — chats stack upward from here.
                marginTop: 0,
                marginBottom: 2,
                minHeight: 24,
              }}
            >
              <Text style={{ color: colors.secondary, fontSize: 13, lineHeight: 18 }}>
                {t("messages.search.recentsTitle")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("messages.search.recentsClear")}
                onPress={handleClearRecentSearch}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.65 : 1,
                  paddingVertical: 4,
                  paddingLeft: 8,
                })}
              >
                <Text style={{ color: colors.accent, fontSize: 13, lineHeight: 18 }}>
                  {t("messages.search.recentsClear")}
                </Text>
              </Pressable>
            </View>
          );
        }
        if (item.kind === "messagesFooter") {
          const countLabel = tf("messages.search.messagesFound", {
            count: String(Math.max(0, Math.trunc(Number(item.count) || 0))),
          });
          return (
            <View
              key={item.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                backgroundColor: colors.undercover,
                borderTopWidth: listSearchActive ? 1 : 0,
                borderBottomWidth: listSearchActive ? 0 : 1,
                borderTopColor: colors.highlight,
                borderBottomColor: colors.highlight,
                paddingVertical: 10,
                paddingHorizontal: layout.contentSideInsetPx,
                // Nearest the search field in column-reverse — content stacks upward from here.
                marginTop: listSearchActive ? 0 : 2,
                marginBottom: listSearchActive ? 2 : 0,
              }}
            >
              <Text
                style={{ color: colors.secondary, fontSize: 13, lineHeight: 18, flex: 1, flexShrink: 1, minWidth: 0 }}
                numberOfLines={1}
              >
                {countLabel}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("messages.search.allChats")}
                onPress={dismissChatListSearch}
                hitSlop={8}
              >
                <Text style={{ color: colors.primary, fontSize: 13, lineHeight: 18 }}>
                  {t("messages.search.allChats")}
                </Text>
              </Pressable>
            </View>
          );
        }
        const listCompactOpen =
          compactChatLayout || readAuthenticatedHomeCompactChatLayoutSync();
        const openCompactChatFromRowRelease = () => {
          const tap = compactRowTapRef.current;
          if (!tap || tap.chatId !== item.row.telegram_chat_id) return;
          if (Date.now() - tap.at > 700) return;
          if (pinnedDragMovedRef.current) return;
          compactRowTapRef.current = null;
          handleChatPress(item.row, "press_out");
        };
        return (
          <View
            key={item.key}
            {...(Platform.OS === "web" &&
            listSearchActive
              ? ({
                  onPointerDown: (e: { button?: number; stopPropagation?: () => void }) => {
                    if (e.button != null && e.button !== 0) return;
                    if (pinnedDragMovedRef.current) return;
                    markChatListSearchRowPressPending();
                  },
                } as object)
              : Platform.OS === "web" &&
            !listSearchActive &&
            pinnedIndexByChatId.has(item.row.telegram_chat_id)
              ? ({
                  "data-pinned-index": String(
                    pinnedIndexByChatId.get(item.row.telegram_chat_id),
                  ),
                  onPointerDown: (e: {
                    button?: number;
                    clientY: number;
                    stopPropagation?: () => void;
                  }) => {
                    if (e.button != null && e.button !== 0) return;
                    const idx = pinnedIndexByChatId.get(item.row.telegram_chat_id);
                    if (idx == null) return;
                    pinnedDragFromRef.current = idx;
                    pinnedDragStartYRef.current = e.clientY;
                    pinnedDragMovedRef.current = false;
                    pinnedOrderBeforeDragRef.current = listModeChats
                      .filter((row) => resolveChatListTier(row) === "pinned")
                      .map((row) => row.telegram_chat_id);
                    pinnedOrderLiveRef.current = pinnedOrderBeforeDragRef.current;
                  },
                  style: { cursor: "grab" },
                } as object)
              : {})}
            {...(Platform.OS === "web" && chatSelectionEnabled && listCompactOpen
              ? ({
                  onPointerUp: (e: { button?: number }) => {
                    if (e.button != null && e.button !== 0) return;
                    openCompactChatFromRowRelease();
                  },
                } as object)
              : {})}
          >
            <MessageChatRow
              item={item.row}
              isLast={isVisualBottomEdge}
              isActive={
                chatSelectionEnabled &&
                middleColumnFocus === "chat" &&
                selectedChatId === item.row.telegram_chat_id
              }
              prioritizeAvatar={prioritizeAvatarChatIds.has(item.row.telegram_chat_id)}
              colors={colors}
              timePendingLabel={t("feed.timePending")}
              onPress={
                chatSelectionEnabled
                  ? () => {
                      if (pinnedDragMovedRef.current) return;
                      handleChatPress(item.row, "press");
                    }
                  : undefined
              }
              onPressIn={
                chatSelectionEnabled
                  ? () => {
                      if (listSearchActive) markChatListSearchRowPressPending();
                      logPageDisplay(
                        "messages_chat_row_press_in",
                        chatLogFields({
                          chatId: item.row.telegram_chat_id,
                          peerUserId: item.row.peer_user_id,
                          title: item.row.title,
                        }),
                      );
                      if (listCompactOpen) {
                        compactRowTapRef.current = {
                          chatId: item.row.telegram_chat_id,
                          at: Date.now(),
                        };
                        return;
                      }
                      setOpenChatFocusHold(item.row.telegram_chat_id);
                      demoteQueuedNetworkFetches();
                      clearQueuedNormalNetworkFetches();
                      prefetchChatHistoryPriority(item.row);
                      void warmupTelegramChatSession(item.row.telegram_chat_id);
                    }
                  : undefined
              }
              onPressOut={
                chatSelectionEnabled && listCompactOpen
                  ? openCompactChatFromRowRelease
                  : undefined
              }
              onOpenContextMenu={(anchor) => handleOpenChatListMenu(item.row, anchor)}
              onAvatarPress={() => openProfileSheet(item.row)}
              onPrefetch={() => handleRowPrefetch(item.row)}
              onOpenApp={handleChatListOpenApp}
            />
          </View>
        );
      })}
      {chatListVirtualWindow.enabled && chatListVirtualWindow.bottomSpacerPx > 0 ? (
        <View style={{ height: chatListVirtualWindow.bottomSpacerPx }} />
      ) : null}
      {!listSearchActive ? (
        <ChatListBottomSentinel
          enabled={listModeChats.length > 0 && !listSearchActive}
          onNearBottom={handleChatListNearBottom}
        />
      ) : null}
    </>
  );

  const listShellStyle = homeListShellStyle(wideListChrome);

  // Session says linked (or still unknown) — never flash the connect CTA before status settles.
  const connectionStatusPending =
    !authReady ||
    sessionTelegramMessagesConnected === null ||
    (sessionTelegramMessagesConnected === true &&
      !isTelegramMessagesConnected &&
      !userDisconnectedTelegramMessages);

  if (connectionStatusPending) {
    return (
      <View style={[listShellStyle, { paddingVertical: 24, alignItems: "center" }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!isTelegramMessagesConnected) {
    return (
      <View style={[listShellStyle, { paddingVertical: 24, alignItems: "center" }]}>
        <Text
          style={{
            textAlign: "center",
            color: colors.secondary,
            fontSize: 15,
            lineHeight: 20,
            maxWidth: 320,
          }}
        >
          {t("messages.connectPrompt")}
        </Text>
      </View>
    );
  }

  if (error && chats.length === 0) {
    return (
      <View style={[listShellStyle, { paddingVertical: 16 }]}>
        <Text style={{ textAlign: "center", color: colors.secondary, fontSize: 15, lineHeight: 20 }}>
          {t("messages.loadError")}
        </Text>
      </View>
    );
  }

  const showChatListSpinner =
    (isTelegramMessagesConnected && !initialChatListRevealed) ||
    (chats.length === 0 &&
      (loading || gatewayWarming || listBootstrapPending || !emptyListConfirmed));

  if (showChatListSpinner) {
    return (
      <View style={[listShellStyle, { paddingVertical: 24, alignItems: "center" }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={[listShellStyle, { paddingVertical: 16 }]}>
        <Text style={{ textAlign: "center", color: colors.secondary, fontSize: 15, lineHeight: 20 }}>
          {t("messages.empty")}
        </Text>
      </View>
    );
  }

  const searchResultChatCount = displayListItems.filter((item) => item.kind === "chat").length;
  const searchEmpty =
    searchNeedle.length > 0 && searchResultChatCount === 0 && remoteMessageCount === 0 ? (
      <Text
        style={{
          textAlign: "center",
          color: colors.secondary,
          fontSize: 15,
          lineHeight: 20,
          paddingVertical: 16,
        }}
      >
        {t("messages.search.noResults")}
      </Text>
    ) : recentsMode && recentSearchLoaded && displayChats.length === 0 ? (
      <Text
        style={{
          textAlign: "center",
          color: colors.secondary,
          fontSize: 15,
          lineHeight: 20,
          paddingVertical: 16,
        }}
      >
        {t("messages.search.recentsEmpty")}
      </Text>
    ) : null;

  const list = (
    <View style={{ width: "100%", alignSelf: "stretch" }} pointerEvents="box-none">
      <View
        style={[
          listShellStyle,
          searchListReplacesMain
            ? {
                // Grow upward from the search field: first result sits at the visual bottom.
                // No minHeight — stretching to the viewport left a large empty gap above the field.
                flexDirection: "column-reverse",
                justifyContent: "flex-start",
              }
            : null,
        ]}
        pointerEvents="box-none"
      >
        {searchEmpty}
        {renderListItems(visibleListItems, visibleChatStartIndex)}
      </View>
    </View>
  );

  const chatListMenuEl = (
    <MessageChatListContextMenu
      visible={chatListMenu != null}
      anchor={chatListMenu?.anchor ?? null}
      colors={colors}
      row={chatListMenu?.row ?? null}
      onClose={handleCloseChatListMenu}
      onTogglePin={handleToggleChatPinned}
      onViewProfile={handleViewChatProfile}
    />
  );

  if (!scrollable) {
    return (
      <>
        {list}
        {chatListMenuEl}
      </>
    );
  }

  return (
    <>
      <ScrollView
        style={{ width: "100%" }}
        contentContainerStyle={{ ...listShellStyle, flexGrow: 1 }}
        onScrollBeginDrag={handleClearSelection}
      >
        {searchEmpty}
        {renderListItems(visibleListItems, visibleChatStartIndex)}
        <Pressable style={{ flexGrow: 1, minHeight: 1 }} onPress={handleClearSelection} />
      </ScrollView>
      {chatListMenuEl}
    </>
  );
}
