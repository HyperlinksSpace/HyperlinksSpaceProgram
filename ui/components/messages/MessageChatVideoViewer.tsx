import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createElement } from "react";
import { createPortal } from "react-dom";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import {
  appLocaleToBcp47,
  type AppLocale,
} from "../../../locales/appStrings";
import { useAppStrings } from "../../../locales/AppStringsContext";
import type { FormattedTextSegment } from "../../../shared/formattedTextSegments";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { FloatingDialogCloseButton } from "../FloatingDialogCloseButton";
import { useTelegram } from "../Telegram";
import { MessageChatLinkifiedText } from "./MessageChatLinkifiedText";

/** Above profile photo viewer (10200). */
const VIDEO_VIEWER_Z = 10250;
const CHROME_PAD_PX = 16;
const CONTROL_BAR_H_PX = 48;

export type MessageChatVideoViewerProps = {
  visible: boolean;
  onClose: () => void;
  src: string;
  posterSrc?: string | null;
  caption?: string | null;
  captionSegments?: FormattedTextSegment[] | null;
  chatTitle?: string | null;
  sentAt?: string | null;
  fileName?: string | null;
};

function formatViewerClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatViewerSentAt(
  iso: string | null | undefined,
  locale: AppLocale,
  atWord: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const tag = appLocaleToBcp47(locale);
  const day = date.toLocaleDateString(tag, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const time = date.toLocaleTimeString(tag, {
    hour: "numeric",
    minute: "2-digit",
  });
  return atWord.trim() ? `${day} ${atWord} ${time}` : `${day} ${time}`;
}

function guessVideoFileName(sentAt: string | null | undefined): string | null {
  if (!sentAt) return null;
  const date = new Date(sentAt);
  if (!Number.isFinite(date.getTime())) return null;
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `video_${y}-${mo}-${d}_${h}-${mi}-${s}.mp4`;
}

function PlayIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 5v14l11-7L8 5Z" fill={color} />
    </Svg>
  );
}

function PauseIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="5" width="4" height="14" rx="1" fill={color} />
      <Rect x="14" y="5" width="4" height="14" rx="1" fill={color} />
    </Svg>
  );
}

function VolumeIcon({
  color,
  muted,
  size = 18,
}: {
  color: string;
  muted: boolean;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9v6h3.5L12 19V5L7.5 9H4Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
      {muted ? (
        <Path d="M16 9l5 5m0-5l-5 5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      ) : (
        <Path
          d="M16 8.5c1.2 1 1.9 2.3 1.9 3.5S17.2 14.5 16 15.5"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

function FullscreenIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Telegram-style fullscreen video overlay: centered player, optional caption,
 * playback chrome, and source meta (chat · date).
 */
export function MessageChatVideoViewer({
  visible,
  onClose,
  src,
  posterSrc = null,
  caption = null,
  captionSegments = null,
  chatTitle = null,
  sentAt = null,
  fileName = null,
}: MessageChatVideoViewerProps) {
  const { t, locale } = useAppStrings();
  const { safeAreaInsetTop, contentSafeAreaInsetTop } = useTelegram();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seekTrackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideChromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topClearance = Math.max(
    CHROME_PAD_PX,
    Math.ceil(safeAreaInsetTop + contentSafeAreaInsetTop + 8),
  );
  const captionText = (caption ?? "").trim();
  const hasCaption = captionText.length > 0;
  const resolvedFileName = fileName?.trim() || guessVideoFileName(sentAt);
  const sentLabel = useMemo(
    () => formatViewerSentAt(sentAt, locale, t("messages.profile.photoAt")),
    [locale, sentAt, t],
  );
  const metaLine = [resolvedFileName, chatTitle?.trim() || null, sentLabel]
    .filter(Boolean)
    .join(" · ");

  const progress = durationSec > 0 ? Math.max(0, Math.min(1, currentSec / durationSec)) : 0;
  const remainingSec = Math.max(0, durationSec - currentSec);

  const bumpChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideChromeTimerRef.current) clearTimeout(hideChromeTimerRef.current);
    hideChromeTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setChromeVisible(false);
      }
    }, 2800);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play().catch(() => {});
        else video.pause();
        bumpChrome();
      }
      if (event.key === "m") {
        event.preventDefault();
        setMuted((prev) => !prev);
        bumpChrome();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bumpChrome, onClose, visible]);

  useEffect(() => {
    if (!visible) return;
    setPlaying(true);
    setMuted(false);
    setCurrentSec(0);
    setDurationSec(0);
    setChromeVisible(true);
    bumpChrome();
    return () => {
      if (hideChromeTimerRef.current) clearTimeout(hideChromeTimerRef.current);
    };
  }, [bumpChrome, src, visible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !visible) return;
    video.muted = muted;
  }, [muted, visible]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
    bumpChrome();
  }, [bumpChrome]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const video = videoRef.current;
      const track = seekTrackRef.current;
      if (!video || !track) return;
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      video.currentTime = ratio * duration;
      setCurrentSec(ratio * duration);
      bumpChrome();
    },
    [bumpChrome],
  );

  const toggleBrowserFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video || Platform.OS !== "web") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void video.requestFullscreen?.().catch(() => {});
    }
    bumpChrome();
  }, [bumpChrome]);

  if (!visible || !src.trim()) return null;

  const maxVideoW = Math.max(280, Math.min(windowWidth - CHROME_PAD_PX * 2, 1100));
  const maxVideoH = Math.max(
    180,
    windowHeight - topClearance - CONTROL_BAR_H_PX - (hasCaption ? 120 : 56) - CHROME_PAD_PX * 2,
  );

  const videoNode =
    Platform.OS === "web"
      ? createElement("video", {
          key: src,
          ref: videoRef,
          src,
          poster: posterSrc || undefined,
          autoPlay: true,
          playsInline: true,
          controls: false,
          style: {
            display: "block",
            width: "100%",
            height: "100%",
            maxWidth: maxVideoW,
            maxHeight: maxVideoH,
            objectFit: "contain",
            backgroundColor: "#000",
          },
          onClick: (event: { stopPropagation?: () => void }) => {
            event.stopPropagation?.();
            togglePlay();
          },
          onPlay: () => {
            setPlaying(true);
            bumpChrome();
          },
          onPause: () => {
            setPlaying(false);
            setChromeVisible(true);
          },
          onTimeUpdate: () => {
            const video = videoRef.current;
            if (!video) return;
            setCurrentSec(video.currentTime);
            if (Number.isFinite(video.duration) && video.duration > 0) {
              setDurationSec(video.duration);
            }
          },
          onLoadedMetadata: () => {
            const video = videoRef.current;
            if (!video) return;
            if (Number.isFinite(video.duration) && video.duration > 0) {
              setDurationSec(video.duration);
            }
            void video.play().catch(() => {});
          },
        })
      : null;

  const body = (
    <View
      style={{
        position: Platform.OS === "web" ? ("fixed" as unknown as "absolute") : "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: VIDEO_VIEWER_Z,
        elevation: VIDEO_VIEWER_Z,
        backgroundColor: "rgba(0,0,0,0.88)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("messages.videoViewer.closeA11y")}
        onPress={onClose}
        style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
      />

      <View
        pointerEvents="box-none"
        style={{
          width: maxVideoW,
          maxHeight: windowHeight - topClearance - CHROME_PAD_PX,
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            maxHeight: maxVideoH,
            aspectRatio: 16 / 9,
            backgroundColor: "#000",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {videoNode}

          {hasCaption && chromeVisible ? (
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: CONTROL_BAR_H_PX,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: "rgba(0,0,0,0.35)",
              }}
            >
              <MessageChatLinkifiedText
                text={captionText}
                segments={captionSegments}
                linkColor="#6CB6FF"
                style={{
                  color: "#FFFFFF",
                  fontSize: 14,
                  lineHeight: 20,
                  fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
                  textShadowColor: "rgba(0,0,0,0.55)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 3,
                }}
                numberOfLines={6}
              />
            </View>
          ) : null}

          {chromeVisible ? (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: CONTROL_BAR_H_PX,
                backgroundColor: "rgba(20,20,20,0.92)",
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 10,
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 12,
                  fontVariant: ["tabular-nums"],
                  fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
                  minWidth: 40,
                }}
              >
                {formatViewerClock(currentSec)}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  playing ? t("messages.videoViewer.pauseA11y") : t("messages.videoViewer.playA11y")
                }
                onPress={togglePlay}
                hitSlop={8}
                style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
              >
                {playing ? <PauseIcon color="#FFFFFF" /> : <PlayIcon color="#FFFFFF" />}
              </Pressable>

              {Platform.OS === "web"
                ? createElement("div", {
                    ref: seekTrackRef,
                    onPointerDown: (event: { clientX: number; preventDefault: () => void }) => {
                      event.preventDefault();
                      seekFromClientX(event.clientX);
                    },
                    style: {
                      flex: 1,
                      height: 18,
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                      minWidth: 80,
                    },
                    children: [
                      createElement("div", {
                        key: "track",
                        style: {
                          position: "relative",
                          width: "100%",
                          height: 3,
                          backgroundColor: "rgba(255,255,255,0.22)",
                          borderRadius: 2,
                          overflow: "hidden",
                        },
                        children: createElement("div", {
                          style: {
                            width: `${progress * 100}%`,
                            height: "100%",
                            backgroundColor: "#FFFFFF",
                          },
                        }),
                      }),
                    ],
                  })
                : (
                  <View style={{ flex: 1, height: 3, backgroundColor: "rgba(255,255,255,0.22)" }}>
                    <View
                      style={{
                        width: `${progress * 100}%`,
                        height: 3,
                        backgroundColor: "#FFFFFF",
                      }}
                    />
                  </View>
                )}

              <Text
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 12,
                  fontVariant: ["tabular-nums"],
                  fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
                  minWidth: 48,
                  textAlign: "right",
                }}
              >
                -{formatViewerClock(remainingSec)}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  muted ? t("messages.videoViewer.unmuteA11y") : t("messages.videoViewer.muteA11y")
                }
                onPress={() => {
                  setMuted((prev) => !prev);
                  bumpChrome();
                }}
                hitSlop={8}
                style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
              >
                <VolumeIcon color="#FFFFFF" muted={muted} />
              </Pressable>

              {Platform.OS === "web" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("messages.videoViewer.fullscreenA11y")}
                  onPress={toggleBrowserFullscreen}
                  hitSlop={8}
                  style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
                >
                  <FullscreenIcon color="#FFFFFF" />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          paddingTop: topClearance,
          paddingHorizontal: CHROME_PAD_PX,
          flexDirection: "row",
          justifyContent: "flex-end",
        }}
      >
        <FloatingDialogCloseButton
          label={t("common.close")}
          onPress={onClose}
          color="#FFFFFF"
        />
      </View>

      {metaLine && chromeVisible ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: CHROME_PAD_PX,
            right: CHROME_PAD_PX,
            bottom: CHROME_PAD_PX,
          }}
        >
          <Text
            style={{
              color: "rgba(255,255,255,0.78)",
              fontSize: 12,
              lineHeight: 16,
              fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
              textShadowColor: "rgba(0,0,0,0.55)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
            }}
            numberOfLines={2}
          >
            {metaLine}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (Platform.OS === "web") {
    if (!portalTarget) return null;
    return createPortal(body, portalTarget);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}
