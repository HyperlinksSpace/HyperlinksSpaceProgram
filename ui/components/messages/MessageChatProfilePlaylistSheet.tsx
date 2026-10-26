import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type TextStyle,
} from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { unlockMusicAutoplay } from "../../music/musicAudioElement";
import {
  getMusicPlayer,
  setMusicTracks,
  startMusicPlaylist,
  subscribeMusicPlayer,
  toggleMusicPlay,
  type MusicPlayerSnapshot,
} from "../../music/musicPlayerStore";
import { SCROLL_INDICATOR_OVERLAY_CHROME_BORDER_INSET_PX } from "../../scrollIndicatorPx";
import {
  fetchTelegramUserProfileExtras,
  telegramProfileAudioCoverUrl,
  type TelegramProfileAudioTrack,
} from "../../telegram/fetchTelegramUserProfile";
import {
  downloadProfilePlaylistTrack,
  forwardProfilePlaylistTrack,
  persistProfilePlaylistOrder,
  removeProfilePlaylistTrack,
  mergeProfilePlaylistFileIds,
  reorderProfilePlaylistTracks,
} from "../../telegram/profilePlaylistActions";
import { emitProfilePlaylistReordered } from "../../telegram/profilePlaylistSync";
import { appWarn } from "../../../shared/appLog";
import { listTelegramDirectoryChats } from "../../telegram/telegramChatDirectory";
import { useTelegramMessagesConnection } from "../../telegram/TelegramMessagesConnectionContext";
import { useColors, layout } from "../../theme";
import { resolveFloatingDialogInsets } from "../floatingDialogChrome";
import { FloatingDialogScrollChromeProvider } from "../floatingDialogScrollChrome";
import { FloatingDialogStickyHeader } from "../FloatingDialogStickyHeader";
import { FloatingDialogShell } from "../FloatingDialogShell";
import { resolveFloatingDialogDefaultSize } from "../floatingDialogGeometry";
import { HspScrollColumn } from "../HspScrollColumn";
import {
  MusicBackChevronIcon,
  MusicPauseIcon,
  MusicPlayIcon,
  MusicReorderIcon,
} from "../music/MusicControlIcons";
import { ProfileOpenHitTarget } from "./ProfileOpenHitTarget";
import {
  MessageChatProfileAudioCoverImage,
  prefetchMessageChatProfileAudioCover,
} from "./MessageChatProfileAudioCoverImage";
import {
  MessageChatProfilePlaylistContextMenu,
  type PlaylistMenuAnchor,
} from "./MessageChatProfilePlaylistContextMenu";
import { MessageChatProfilePlaylistForwardSheet } from "./MessageChatProfilePlaylistForwardSheet";
import {
  MESSAGE_FONT_SIZE_PX,
  MESSAGE_LINE_HEIGHT_PX,
} from "./messageListLayout";

/** Only fields the playlist UI needs — ignore time/buffer ticks so covers keep loading. */
type PlaylistPlaybackSnap = {
  playing: boolean;
  index: number;
  fileId: number | null;
  userId: number | null;
};

function playlistPlaybackSnap(snap: MusicPlayerSnapshot): PlaylistPlaybackSnap {
  const track = snap.tracks[snap.index] ?? null;
  return {
    playing: snap.playing,
    index: snap.index,
    fileId: track?.file_id ?? null,
    userId: track?.user_id ?? null,
  };
}

let cachedPlaylistPlayback: PlaylistPlaybackSnap = playlistPlaybackSnap(getMusicPlayer());

function getPlaylistPlaybackSnap(): PlaylistPlaybackSnap {
  const next = playlistPlaybackSnap(getMusicPlayer());
  const prev = cachedPlaylistPlayback;
  if (
    prev.playing === next.playing &&
    prev.index === next.index &&
    prev.fileId === next.fileId &&
    prev.userId === next.userId
  ) {
    return prev;
  }
  cachedPlaylistPlayback = next;
  return next;
}

const PAD_X_PX = 20;
/** Above profile sheet (10100) so playlist opens on top when launched from profile. */
const PROFILE_OVERLAY_Z = 10150;
const COVER_PX = 40;
const PLAY_BTN_PX = 28;
const ROW_GAP_PX = 10;
/** Approximate row height for viewport-based cover fetch / row virtualization. */
const PLAYLIST_ROW_STRIDE_PX = 56;
/**
 * Playlist covers are 40×40. Minithumbnails (~40px JPEG, often smaller) stay as
 * instant placeholders; visible rows lazy-fetch album_cover_thumbnail (sharp
 * enough at COVER_PX) via the auth proxy — never full album art.
 */
const PLAYLIST_COVER_PREFETCH_ROWS = 4;
/** Warm a short first screen of thumbnail covers before scroll metrics settle. */
const PLAYLIST_COVER_OPEN_PREFETCH = 8;
/** Extra rows kept mounted above/below the viewport (DOM virtualization). */
const PLAYLIST_ROW_OVERSCAN = 8;

type Props = {
  visible: boolean;
  tracks: TelegramProfileAudioTrack[];
  onClose: () => void;
  onBack: () => void;
};

function textBase(color: string, extra?: TextStyle): TextStyle {
  return {
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: MESSAGE_FONT_SIZE_PX,
    lineHeight: MESSAGE_LINE_HEIGHT_PX,
    includeFontPadding: false,
    paddingVertical: 0,
    color,
    ...extra,
  };
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (!(bytes > 0)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(0.1, bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Sharp album_cover_thumbnail proxy when available; else embedded minithumbnail. */
function trackCoverUri(track: TelegramProfileAudioTrack): string | null {
  if (track.cover_file_id != null) {
    return telegramProfileAudioCoverUrl(track.user_id, track.cover_file_id);
  }
  if (typeof track.cover_data_url === "string" && track.cover_data_url.trim()) {
    return track.cover_data_url.trim();
  }
  return null;
}

/** Instant blurry preview while the thumbnail proxy loads. */
function trackCoverPlaceholder(track: TelegramProfileAudioTrack): string | null {
  if (track.cover_file_id == null) return null;
  if (typeof track.cover_data_url === "string" && track.cover_data_url.trim()) {
    return track.cover_data_url.trim();
  }
  return null;
}

function trackCoverNeedsNetworkFetch(uri: string): boolean {
  return uri.includes("/api/telegram-messages-profile-audio-cover");
}

function samePlaylist(tracks: TelegramProfileAudioTrack[]): boolean {
  const snap = getMusicPlayer();
  if (!snap.visible || snap.tracks.length !== tracks.length) return false;
  return snap.tracks.every((row, i) => row.file_id === tracks[i]?.file_id && row.user_id === tracks[i]?.user_id);
}

export function MessageChatProfilePlaylistSheet({
  visible,
  tracks,
  onClose,
  onBack,
}: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const { connectedTelegramUserId } = useTelegramMessagesConnection();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const defaultSize = useMemo(
    () => resolveFloatingDialogDefaultSize(windowWidth, windowHeight, "profileList"),
    [windowHeight, windowWidth],
  );
  const dialogInsets = resolveFloatingDialogInsets(windowHeight);
  const playback = useSyncExternalStore(
    subscribeMusicPlayer,
    getPlaylistPlaybackSnap,
    getPlaylistPlaybackSnap,
  );
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const [localTracks, setLocalTracks] = useState<TelegramProfileAudioTrack[]>(safeTracks);
  const [scrollY, setScrollY] = useState(0);
  const [scrollLayoutH, setScrollLayoutH] = useState(0);
  const [headerExtendPx, setHeaderExtendPx] = useState(0);
  const [menuAnchor, setMenuAnchor] = useState<PlaylistMenuAnchor | null>(null);
  const [menuTrackIndex, setMenuTrackIndex] = useState<number | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTrack, setForwardTrack] = useState<TelegramProfileAudioTrack | null>(null);
  const dragFromRef = useRef<number | null>(null);
  /** File id of the row grabbed for drag — index changes while bubbling. */
  const dragFileIdRef = useRef<number | null>(null);
  const dragDirtyRef = useRef(false);
  const [reordering, setReordering] = useState(false);
  const localTracksRef = useRef(localTracks);
  localTracksRef.current = localTracks;
  const playlistRefreshGenRef = useRef(0);
  const playlistOwnerUserId = useMemo(() => {
    const fromTracks =
      localTracks[0]?.user_id ??
      safeTracks[0]?.user_id ??
      playback.userId;
    return fromTracks != null && Number.isFinite(fromTracks) ? Math.trunc(fromTracks) : null;
  }, [localTracks, playback.userId, safeTracks]);

  const isOwnPlaylist = useMemo(() => {
    if (connectedTelegramUserId == null || playlistOwnerUserId == null) return false;
    return Math.trunc(connectedTelegramUserId) === playlistOwnerUserId;
  }, [connectedTelegramUserId, playlistOwnerUserId]);

  useEffect(() => {
    const incoming = Array.isArray(tracks) ? tracks : [];
    setLocalTracks((prev) => {
      if (dragDirtyRef.current) return prev;
      if (!visible) return incoming;
      if (
        Array.isArray(prev) &&
        prev.length > incoming.length &&
        incoming.length > 0 &&
        prev[0]?.user_id === incoming[0]?.user_id
      ) {
        return prev;
      }
      localTracksRef.current = incoming;
      return incoming;
    });
  }, [tracks, visible]);

  useEffect(() => {
    if (!visible) return;
    const seedTracks = Array.isArray(tracks) ? tracks : [];
    const userId =
      getMusicPlayer().tracks[0]?.user_id ??
      seedTracks[0]?.user_id;
    if (userId == null || !Number.isFinite(userId) || userId === 0) return;

    const refreshGen = playlistRefreshGenRef.current + 1;
    playlistRefreshGenRef.current = refreshGen;
    let cancelled = false;

    void fetchTelegramUserProfileExtras(0, userId, undefined, { priority: "high" }).then((result) => {
      if (cancelled || refreshGen !== playlistRefreshGenRef.current || !result.ok) return;
      // Don't clobber an in-progress / just-finished local reorder with a stale fetch.
      if (dragDirtyRef.current || dragFromRef.current != null) return;
      const full = result.extras.playlist;
      if (!Array.isArray(full) || full.length === 0) return;
      localTracksRef.current = full;
      setLocalTracks(full);
    });

    return () => {
      cancelled = true;
    };
    // Refresh once when the sheet opens; full list comes from profile API (may exceed player queue).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-once refresh keyed on visible
  }, [visible]);

  const coverFetchWindow = useMemo(() => {
    const layoutH = scrollLayoutH > 0 ? scrollLayoutH : 480;
    const start = Math.max(
      0,
      Math.floor(scrollY / PLAYLIST_ROW_STRIDE_PX) - PLAYLIST_COVER_PREFETCH_ROWS,
    );
    const end = Math.min(
      localTracks.length - 1,
      Math.max(
        PLAYLIST_COVER_OPEN_PREFETCH - 1,
        Math.ceil((scrollY + layoutH) / PLAYLIST_ROW_STRIDE_PX) + PLAYLIST_COVER_PREFETCH_ROWS,
      ),
    );
    return { start, end };
  }, [localTracks.length, scrollLayoutH, scrollY]);

  const rowWindow = useMemo(() => {
    const layoutH = scrollLayoutH > 0 ? scrollLayoutH : 480;
    const start = Math.max(0, Math.floor(scrollY / PLAYLIST_ROW_STRIDE_PX) - PLAYLIST_ROW_OVERSCAN);
    const end = Math.min(
      localTracks.length - 1,
      Math.ceil((scrollY + layoutH) / PLAYLIST_ROW_STRIDE_PX) + PLAYLIST_ROW_OVERSCAN,
    );
    return { start, end };
  }, [localTracks.length, scrollLayoutH, scrollY]);

  useEffect(() => {
    if (!visible) return;
    // Prefetch album_cover_thumbnail for near-viewport rows only (not full art).
    // Critical so playlist interaction (scroll / play) keeps covers moving even
    // while the playing track holds top TDLib priority on the gateway.
    // Re-runs when the active track changes so covers stay queued alongside audio.
    for (let i = coverFetchWindow.start; i <= coverFetchWindow.end; i += 1) {
      const track = localTracks[i];
      if (!track) continue;
      const cover = trackCoverUri(track);
      if (!cover || !trackCoverNeedsNetworkFetch(cover)) continue;
      prefetchMessageChatProfileAudioCover(cover, {
        priority: "critical",
      });
    }
  }, [
    coverFetchWindow.end,
    coverFetchWindow.start,
    localTracks,
    playback.fileId,
    playback.playing,
    visible,
  ]);

  const persistReorder = useCallback(() => {
    if (!isOwnPlaylist || !dragDirtyRef.current) return;
    const fileId = dragFileIdRef.current;
    const tracksAfterDrag = localTracksRef.current;
    // Ref is updated synchronously in moveTrack — do not wait for React re-render.
    const ids = tracksAfterDrag
      .map((row) => Math.trunc(Number(row.file_id)))
      .filter((id) => Number.isFinite(id) && id > 0);
    dragDirtyRef.current = false;
    dragFileIdRef.current = null;
    setReordering(false);
    if (ids.length === 0) return;

    const moved =
      fileId != null && Number.isFinite(fileId) && fileId > 0
        ? (() => {
            const movedId = Math.trunc(fileId);
            const index = ids.indexOf(movedId);
            if (index < 0) return undefined;
            const afterFileId = index === 0 ? 0 : ids[index - 1]!;
            return { fileId: movedId, afterFileId };
          })()
        : undefined;

    playlistRefreshGenRef.current += 1;
    const ownerId = playlistOwnerUserId;

    const applySynced = () => {
      if (ownerId != null) {
        emitProfilePlaylistReordered(ownerId, tracksAfterDrag);
      }
    };

    void (async () => {
      let result = await persistProfilePlaylistOrder(ids, moved);
      if (!result.ok && result.error === "playlist_incomplete" && ownerId != null) {
        const refreshed = await fetchTelegramUserProfileExtras(0, ownerId, undefined, {
          priority: "high",
        });
        if (refreshed.ok && refreshed.extras.playlist.length > 0) {
          const full = refreshed.extras.playlist;
          const fullIds = full.map((row) => Math.trunc(row.file_id));
          const mergedIds = mergeProfilePlaylistFileIds(fullIds, ids);
          result = await reorderProfilePlaylistTracks(mergedIds);
          if (result.ok) {
            const byId = new Map(full.map((row) => [row.file_id, row]));
            const mergedTracks = mergedIds
              .map((id) => byId.get(id))
              .filter((row): row is TelegramProfileAudioTrack => row != null);
            localTracksRef.current = mergedTracks;
            setLocalTracks(mergedTracks);
            emitProfilePlaylistReordered(ownerId, mergedTracks);
            return;
          }
        }
      }
      if (!result.ok) {
        result = await reorderProfilePlaylistTracks(ids);
      }
      if (result.ok) {
        applySynced();
        return;
      }
      appWarn("[playlist-reorder]", result.error, { trackCount: ids.length });
    })();
  }, [isOwnPlaylist, playlistOwnerUserId]);

  const moveTrack = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const prev = localTracksRef.current;
    if (!Array.isArray(prev) || from >= prev.length || to >= prev.length) return;
    const next = [...prev];
    const [row] = next.splice(from, 1);
    if (!row) return;
    next.splice(to, 0, row);
    // Keep ref in sync before setState so pointerup can persist the final order.
    localTracksRef.current = next;
    dragDirtyRef.current = true;
    if (samePlaylist(prev)) {
      const current = getMusicPlayer().tracks[getMusicPlayer().index];
      setMusicTracks(next, current?.file_id);
    }
    setLocalTracks(next);
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS !== "web" || typeof document === "undefined") return;
    const onMove = (event: PointerEvent) => {
      const from = dragFromRef.current;
      if (from == null) return;
      event.preventDefault();
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const row = el?.closest?.("[data-playlist-index]") as HTMLElement | null;
      if (!row) return;
      const to = Number(row.dataset.playlistIndex);
      if (!Number.isFinite(to) || to === from) return;
      moveTrack(from, to);
      dragFromRef.current = to;
    };
    const onUp = () => {
      if (dragFromRef.current != null) persistReorder();
      dragFromRef.current = null;
      setReordering(false);
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    return () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
    };
  }, [moveTrack, persistReorder, visible]);

  const openTrackMenu = useCallback((index: number, event: GestureResponderEvent) => {
    const x = Number(event.nativeEvent.pageX);
    const y = Number(event.nativeEvent.pageY);
    setMenuTrackIndex(index);
    setMenuAnchor({
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    });
  }, []);

  const closeTrackMenu = useCallback(() => {
    setMenuAnchor(null);
    setMenuTrackIndex(null);
  }, []);

  const menuTrack =
    menuTrackIndex != null && menuTrackIndex >= 0 && menuTrackIndex < localTracks.length
      ? localTracks[menuTrackIndex]!
      : null;

  const handleSaveAs = useCallback(() => {
    if (!menuTrack) return;
    downloadProfilePlaylistTrack(menuTrack);
  }, [menuTrack]);

  const handleForward = useCallback(() => {
    if (!menuTrack) return;
    setForwardTrack(menuTrack);
    setForwardOpen(true);
  }, [menuTrack]);

  const handleDelete = useCallback(() => {
    if (!menuTrack || !isOwnPlaylist) return;
    const fileId = menuTrack.file_id;
    const prev = localTracksRef.current;
    const next = prev.filter((row) => row.file_id !== fileId);
    localTracksRef.current = next;
    setLocalTracks(next);
    if (samePlaylist(prev)) {
      const current = getMusicPlayer().tracks[getMusicPlayer().index];
      setMusicTracks(next, current?.file_id);
    }
    playlistRefreshGenRef.current += 1;
    void removeProfilePlaylistTrack(fileId);
  }, [isOwnPlaylist, menuTrack]);

  const playTrack = useCallback(
    (index: number) => {
      const track = localTracks[index];
      if (!track) return;
      unlockMusicAutoplay();
      const snap = getMusicPlayer();
      const current = snap.tracks[snap.index];
      const sameTrack =
        current != null &&
        current.file_id === track.file_id &&
        current.user_id === track.user_id;
      if (sameTrack && snap.playing) {
        toggleMusicPlay();
        return;
      }
      startMusicPlaylist(localTracks, index);
    },
    [localTracks],
  );

  const sheetBody = (
    <FloatingDialogScrollChromeProvider headerExtendPx={headerExtendPx}>
      <View
        style={{
          flex: 1,
          minHeight: 0,
          flexDirection: "column",
          overflow: "hidden",
        }}
        {...(Platform.OS === "web"
          ? ({
              dataSet: {
                profilePlaylistSheet: "1",
                hspFloatingDialogBody: "1",
              },
            } as object)
          : {})}
      >
        <FloatingDialogStickyHeader
          insets={dialogInsets}
          title={t("messages.profile.playlistTitle")}
          titleAlign="center"
          onClose={onClose}
          closeLabel={t("common.close")}
          onHeightChange={setHeaderExtendPx}
          leading={
            <ProfileOpenHitTarget
              label={t("common.back")}
              onPress={onBack}
              style={{ width: 32, height: 32 }}
            >
              <MusicBackChevronIcon color={colors.primary} size={16} />
            </ProfileOpenHitTarget>
          }
        />
        <HspScrollColumn
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{
            paddingTop: dialogInsets.bodyPadTop,
            paddingHorizontal: PAD_X_PX,
            paddingBottom: dialogInsets.bodyPadBottom,
          }}
        scrollbarRightInsetPx={SCROLL_INDICATOR_OVERLAY_CHROME_BORDER_INSET_PX}
        scrollIndicatorOverlaySeam={false}
        containOverscroll
        onScrollPositionChange={(metrics) => {
          setScrollY(metrics.scrollY);
          setScrollLayoutH(metrics.layoutH);
        }}
        onMetricsChange={(metrics) => {
          setScrollLayoutH(metrics.layoutH);
        }}
      >
        {localTracks.length === 0 ? (
          <Text style={[textBase(colors.secondary), { paddingTop: 8 }]}>
            {t("messages.profile.playlistEmpty")}
          </Text>
        ) : (
          <>
            {rowWindow.start > 0 ? (
              <View style={{ height: rowWindow.start * PLAYLIST_ROW_STRIDE_PX }} />
            ) : null}
            {localTracks.slice(rowWindow.start, rowWindow.end + 1).map((track, sliceIndex) => {
              const index = rowWindow.start + sliceIndex;
              const active =
                playback.fileId != null &&
                playback.fileId === track.file_id &&
                playback.userId === track.user_id;
              const meta = [formatClock(track.duration_sec), formatSize(track.size_bytes)]
                .filter(Boolean)
                .join(", ");
              const cover = trackCoverUri(track);
              const coverPlaceholder = trackCoverPlaceholder(track);
              const coverNeedsNetwork = cover != null && trackCoverNeedsNetworkFetch(cover);
              const coverLoadEnabled =
                !coverNeedsNetwork ||
                (index >= coverFetchWindow.start && index <= coverFetchWindow.end);
              return (
                <View
                  key={`${track.user_id}:${track.file_id}`}
                  {...(Platform.OS === "web"
                    ? ({
                        dataSet: { playlistIndex: String(index) },
                        onContextMenu: (event: {
                          preventDefault?: () => void;
                          stopPropagation?: () => void;
                          clientX?: number;
                          clientY?: number;
                        }) => {
                          event.preventDefault?.();
                          event.stopPropagation?.();
                          setMenuTrackIndex(index);
                          setMenuAnchor({
                            x: Number(event.clientX) || 0,
                            y: Number(event.clientY) || 0,
                          });
                        },
                      } as object)
                    : {})}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    height: PLAYLIST_ROW_STRIDE_PX,
                    paddingVertical: 8,
                    gap: ROW_GAP_PX,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("messages.music.reorder")}
                    onPressIn={(event) => {
                      dragFromRef.current = index;
                      dragFileIdRef.current = localTracksRef.current[index]?.file_id ?? null;
                      setReordering(true);
                      if (Platform.OS === "web") {
                        const native = event.nativeEvent as unknown as {
                          pointerId?: number;
                          currentTarget?: { setPointerCapture?: (id: number) => void };
                          target?: { setPointerCapture?: (id: number) => void };
                        };
                        const pointerId = Number(native.pointerId);
                        const host = native.currentTarget ?? native.target;
                        if (
                          Number.isFinite(pointerId) &&
                          typeof host?.setPointerCapture === "function"
                        ) {
                          try {
                            host.setPointerCapture(pointerId);
                          } catch {
                            /* ignore */
                          }
                        }
                      }
                    }}
                    onLongPress={(event) => openTrackMenu(index, event)}
                    delayLongPress={420}
                    style={({ pressed }) => ({
                      width: 22,
                      height: 30,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.6 : 1,
                      cursor: Platform.OS === "web" ? ("grab" as never) : undefined,
                      ...(Platform.OS === "web"
                        ? ({ touchAction: "none", userSelect: "none" } as object)
                        : null),
                    })}
                    {...(Platform.OS === "web"
                      ? ({
                          dataSet: {
                            floatingNoDrag: "1",
                            playlistReorder: "true",
                            playlistReordering: reordering ? "true" : undefined,
                          },
                        } as object)
                      : {})}
                  >
                    <MusicReorderIcon color={colors.primary} size={16} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      active && playback.playing
                        ? t("messages.music.pause")
                        : t("messages.music.play")
                    }
                    onPress={() => playTrack(index)}
                    style={({ pressed }) => ({
                      width: PLAY_BTN_PX,
                      height: PLAY_BTN_PX,
                      borderRadius: PLAY_BTN_PX / 2,
                      backgroundColor: colors.undercover,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.75 : 1,
                    })}
                    {...(Platform.OS === "web"
                      ? ({ "data-floating-no-drag": "1" } as object)
                      : {})}
                  >
                    {active && playback.playing ? (
                      <MusicPauseIcon color={colors.primary} size={12} />
                    ) : (
                      <MusicPlayIcon color={colors.primary} size={12} />
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => playTrack(index)}
                    style={{ flex: 1, minWidth: 0 }}
                    {...(Platform.OS === "web"
                      ? ({ "data-floating-no-drag": "1" } as object)
                      : {})}
                  >
                    <Text numberOfLines={1} style={textBase(colors.primary)}>
                      {track.artist}
                      {track.title ? (
                        <Text style={{ color: colors.secondary }}>{` – ${track.title}`}</Text>
                      ) : null}
                    </Text>
                    {meta ? (
                      <Text
                        numberOfLines={1}
                        style={textBase(colors.secondary, {
                          fontSize: 12,
                          lineHeight: 15,
                          marginTop: 2,
                        })}
                      >
                        {meta}
                      </Text>
                    ) : null}
                  </Pressable>
                  {cover ? (
                    <View
                      style={{
                        width: COVER_PX,
                        height: COVER_PX,
                        borderRadius: 4,
                        overflow: "hidden",
                        backgroundColor: colors.undercover,
                      }}
                    >
                      <MessageChatProfileAudioCoverImage
                        uri={cover}
                        placeholderUri={coverPlaceholder}
                        sizePx={COVER_PX}
                        loadEnabled={coverLoadEnabled}
                        fetchPriority="critical"
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
            {rowWindow.end < localTracks.length - 1 ? (
              <View
                style={{
                  height: (localTracks.length - 1 - rowWindow.end) * PLAYLIST_ROW_STRIDE_PX,
                }}
              />
            ) : null}
          </>
        )}
      </HspScrollColumn>
      </View>
    </FloatingDialogScrollChromeProvider>
  );

  return (
    <>
      <FloatingDialogShell
        visible={visible}
        zIndex={PROFILE_OVERLAY_Z}
        defaultSize={defaultSize}
        minSize={{ width: 300, height: 300 }}
        sizeStorageKey="hsp.profilePlaylistSheet.size.v4"
        offsetStorageKey="hsp.profilePlaylistSheet.offset.v4"
        onRequestClose={onBack}
        testId="profile-playlist-sheet"
        moveIgnoreSelector="[data-floating-no-drag],button,[role='button']"
      >
        {sheetBody}
      </FloatingDialogShell>
      <MessageChatProfilePlaylistContextMenu
        visible={menuAnchor != null && menuTrack != null}
        anchor={menuAnchor}
        colors={colors}
        canDelete={isOwnPlaylist}
        onClose={closeTrackMenu}
        onSaveAs={handleSaveAs}
        onForward={handleForward}
        onDelete={handleDelete}
      />
      <MessageChatProfilePlaylistForwardSheet
        visible={forwardOpen && forwardTrack != null}
        chats={listTelegramDirectoryChats()}
        onClose={() => {
          setForwardOpen(false);
          setForwardTrack(null);
        }}
        onPick={(chat) => {
          const track = forwardTrack;
          setForwardOpen(false);
          setForwardTrack(null);
          if (!track) return;
          void forwardProfilePlaylistTrack(chat.telegram_chat_id, track);
        }}
      />
    </>
  );
}

