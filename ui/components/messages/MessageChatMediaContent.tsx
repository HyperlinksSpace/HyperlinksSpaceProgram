import { useEffect, useRef, useState } from "react";
import { createElement } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { Image } from "expo-image";
import type { ThemeColors } from "../../theme";
import type { MessageChatContentKind } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX,
  MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX,
} from "./messageChatLayout";
import { bytesLookLikeTgs, bytesLookLikeVideo } from "./loadTgsAnimation";
import { MessageChatTgsSticker } from "./MessageChatTgsSticker";

type Props = {
  uri: string;
  contentKind: MessageChatContentKind;
  widthPx: number;
  heightPx: number;
  colors: ThemeColors;
};

type ResolvedMediaKind = "tgs" | "video" | "gif" | "image";

export function messageMediaShowsProgressBar(contentKind: MessageChatContentKind): boolean {
  return contentKind === "video" || contentKind === "animation";
}

function MediaProgressBar({
  widthPx,
  progress,
  colors,
}: {
  widthPx: number;
  progress: number;
  colors: ThemeColors;
}) {
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return (
    <View
      style={{
        width: widthPx,
        height: MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX,
        backgroundColor: colors.highlight,
      }}
    >
      <View
        style={{
          width: widthPx * clamped,
          height: MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX,
          backgroundColor: colors.accent,
        }}
      />
    </View>
  );
}

function resolveMediaKind(
  bytes: Uint8Array,
  contentKind: MessageChatContentKind,
  mime: string,
): ResolvedMediaKind {
  const normalizedMime = mime.trim().toLowerCase();
  if (normalizedMime === "application/x-tgsticker" || bytesLookLikeTgs(bytes)) {
    return "tgs";
  }
  if (
    normalizedMime.startsWith("video/") ||
    bytesLookLikeVideo(bytes) ||
    (contentKind === "video" && !normalizedMime.startsWith("image/"))
  ) {
    return "video";
  }
  if (normalizedMime === "image/gif") return "gif";
  if (contentKind === "animation" && bytesLookLikeVideo(bytes)) return "video";
  if (contentKind === "sticker" && bytesLookLikeVideo(bytes)) return "video";
  return "image";
}

function WebMessageChatVideo({
  src,
  widthPx,
  heightPx,
  colors,
  loop,
  showProgress,
  pixelPerfect,
}: {
  src: string;
  widthPx: number;
  heightPx: number;
  colors: ThemeColors;
  loop: boolean;
  showProgress: boolean;
  pixelPerfect?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const playIfVisible = () => {
      const rect = container.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const visible =
        rect.bottom > 0 &&
        rect.top < viewportH &&
        rect.width > 0 &&
        rect.height > 0;
      if (visible) {
        void video.play().catch(() => {});
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.15) {
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.15, 0.35, 0.6, 1] },
    );
    observer.observe(container);

    const syncProgress = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.max(0, Math.min(1, video.currentTime / duration)));
    };

    const onLoadedMetadata = () => {
      setProgress(0);
      playIfVisible();
    };
    const onCanPlay = () => {
      playIfVisible();
    };
    const onEnded = () => {
      if (loop) setProgress(0);
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", syncProgress);
    video.addEventListener("seeking", syncProgress);
    video.addEventListener("ended", onEnded);

    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", syncProgress);
      video.removeEventListener("seeking", syncProgress);
      video.removeEventListener("ended", onEnded);
    };
  }, [src, loop]);

  const objectFit = pixelPerfect ? "contain" : "cover";

  return createElement(
    "div",
    {
      ref: containerRef,
      style: {
        width: widthPx,
        display: "flex",
        flexDirection: "column",
      },
    },
    createElement("video", {
      ref: videoRef,
      src,
      playsInline: true,
      muted: true,
      loop,
      autoPlay: true,
      preload: "auto",
      style: {
        width: widthPx,
        height: heightPx,
        objectFit,
        display: "block",
        ...(pixelPerfect ? ({ imageRendering: "crisp-edges" } as object) : null),
      },
    }),
    showProgress
      ? createElement(
          "div",
          {
            style: {
              width: widthPx,
              height: MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX,
              backgroundColor: colors.highlight,
              position: "relative",
              overflow: "hidden",
            },
          },
          createElement("div", {
            style: {
              width: `${Math.max(0, Math.min(100, progress * 100))}%`,
              height: MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX,
              backgroundColor: colors.accent,
            },
          }),
        )
      : null,
  );
}

function WebMessageChatGifImage({
  src,
  widthPx,
  heightPx,
}: {
  src: string;
  widthPx: number;
  heightPx: number;
}) {
  return createElement("img", {
    src,
    alt: "",
    width: widthPx,
    height: heightPx,
    style: {
      width: widthPx,
      height: heightPx,
      objectFit: "contain",
      display: "block",
      imageRendering: "crisp-edges",
    },
  });
}

export function MessageChatMediaContent({
  uri,
  contentKind,
  widthPx,
  heightPx,
  colors,
}: Props) {
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaBytes, setMediaBytes] = useState<Uint8Array | null>(null);
  const [mediaKind, setMediaKind] = useState<ResolvedMediaKind | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const showProgress = messageMediaShowsProgressBar(contentKind);
  const pixelPerfect = contentKind === "animation" || contentKind === "sticker";

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setFailed(false);
    setMediaUri(null);
    setMediaBytes(null);
    setMediaKind(null);

    void (async () => {
      try {
        const response = await fetch(uri, { method: "GET", credentials: "include" });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        const bytes = new Uint8Array(buffer);
        const resolvedMime = (blob.type || response.headers.get("Content-Type") || "").trim();
        const kind = resolveMediaKind(bytes, contentKind, resolvedMime);
        const blobType =
          kind === "video"
            ? resolvedMime.startsWith("video/")
              ? resolvedMime
              : "video/mp4"
            : kind === "tgs"
              ? "application/x-tgsticker"
              : resolvedMime || "application/octet-stream";
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: blobType }));
        setMediaBytes(bytes);
        setMediaKind(kind);
        setMediaUri(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uri, contentKind]);

  const frameStyle = {
    width: widthPx,
    height: heightPx,
    overflow: "hidden" as const,
    backgroundColor: "transparent",
  };

  if (loading) {
    return (
      <View style={[frameStyle, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (failed || !mediaUri || !mediaKind) {
    return (
      <View>
        <View style={[frameStyle, { backgroundColor: colors.highlight }]} />
        {showProgress ? (
          <MediaProgressBar widthPx={widthPx} progress={0} colors={colors} />
        ) : null}
      </View>
    );
  }

  if (mediaKind === "tgs" && mediaBytes) {
    return (
      <MessageChatTgsSticker data={mediaBytes} widthPx={widthPx} heightPx={heightPx} />
    );
  }

  if (mediaKind === "video" && Platform.OS === "web") {
    return (
      <WebMessageChatVideo
        src={mediaUri}
        widthPx={widthPx}
        heightPx={heightPx}
        colors={colors}
        loop
        showProgress={showProgress}
        pixelPerfect={pixelPerfect}
      />
    );
  }

  if (mediaKind === "gif" && Platform.OS === "web") {
    return (
      <View>
        <WebMessageChatGifImage src={mediaUri} widthPx={widthPx} heightPx={heightPx} />
        {showProgress ? (
          <MediaProgressBar widthPx={widthPx} progress={0} colors={colors} />
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <Image
        source={{ uri: mediaUri }}
        accessibilityIgnoresInvertColors
        style={{
          width: widthPx,
          height: heightPx,
        }}
        contentFit={pixelPerfect ? "contain" : "cover"}
      />
      {showProgress ? (
        <MediaProgressBar widthPx={widthPx} progress={0} colors={colors} />
      ) : null}
    </View>
  );
}

function scaleMediaDimensions(
  sourceW: number,
  sourceH: number,
  maxWidthPx: number,
  pixelPerfect: boolean,
): { widthPx: number; heightPx: number } {
  const maxW = Math.min(maxWidthPx, MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX);
  let widthPx = sourceW;
  let heightPx = sourceH;

  if (widthPx > maxW) {
    const scale = maxW / widthPx;
    widthPx = Math.max(1, Math.round(sourceW * scale));
    heightPx = Math.max(1, Math.round(sourceH * scale));
  } else if (pixelPerfect) {
    widthPx = Math.max(1, Math.round(widthPx));
    heightPx = Math.max(1, Math.round(heightPx));
  } else {
    widthPx = Math.min(maxW, Math.max(120, Math.round(widthPx)));
    heightPx = Math.max(120, Math.min(480, Math.round(heightPx)));
  }

  return { widthPx, heightPx };
}

export function resolveMessageMediaDimensions(
  maxWidthPx: number,
  mediaWidth: number | null | undefined,
  mediaHeight: number | null | undefined,
  contentKind?: MessageChatContentKind,
): { widthPx: number; heightPx: number } {
  const pixelPerfect =
    contentKind === "animation" || contentKind === "sticker";
  const sourceW = Math.round(Number(mediaWidth));
  const sourceH = Math.round(Number(mediaHeight));
  if (Number.isFinite(sourceW) && Number.isFinite(sourceH) && sourceW > 0 && sourceH > 0) {
    return scaleMediaDimensions(sourceW, sourceH, maxWidthPx, pixelPerfect);
  }
  const widthPx = Math.min(maxWidthPx, MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX);
  const fallbackHeight = Math.round(widthPx * (pixelPerfect ? 1 : 0.62));
  return { widthPx, heightPx: fallbackHeight };
}

export function messageMediaBlockHeightPx(
  mediaHeightPx: number,
  contentKind: MessageChatContentKind,
): number {
  return (
    mediaHeightPx +
    (messageMediaShowsProgressBar(contentKind) ? MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX : 0)
  );
}
