import { useEffect, useRef, useState } from "react";
import { createElement } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { Image } from "expo-image";
import type { ThemeColors } from "../../theme";
import type { MessageChatContentKind } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_GIF_MAX_PX,
  MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX,
  MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX,
  MESSAGE_BUBBLE_STICKER_MAX_PX,
} from "./messageChatLayout";
import { bytesLookLikeTgs, bytesLookLikeVideo } from "./loadTgsAnimation";
import { MessageChatTgsSticker } from "./MessageChatTgsSticker";

type Props = {
  uri: string;
  contentKind: MessageChatContentKind;
  widthPx: number;
  heightPx: number;
  /** Column cap — used to pixel-fit GIFs/stickers from intrinsic file dimensions. */
  maxWidthPx?: number;
  colors: ThemeColors;
};

function isPixelPerfectMediaKind(contentKind: MessageChatContentKind): boolean {
  return contentKind === "animation" || contentKind === "sticker";
}

function measureWebMediaIntrinsicSize(
  url: string,
  kind: ResolvedMediaKind,
): Promise<{ width: number; height: number } | null> {
  if (Platform.OS !== "web") return Promise.resolve(null);

  return new Promise((resolve) => {
    if (kind === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      const finish = (width: number, height: number) => {
        video.removeAttribute("src");
        video.load();
        video.remove();
        resolve(width > 0 && height > 0 ? { width, height } : null);
      };
      video.onloadedmetadata = () => finish(video.videoWidth, video.videoHeight);
      video.onerror = () => finish(0, 0);
      video.src = url;
      return;
    }

    const img = document.createElement("img");
    const finish = (width: number, height: number) => {
      img.removeAttribute("src");
      img.remove();
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onload = () => finish(img.naturalWidth, img.naturalHeight);
    img.onerror = () => finish(0, 0);
    img.src = url;
  });
}

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
    (contentKind === "animation" && bytesLookLikeVideo(bytes))
  ) {
    return "video";
  }
  if (normalizedMime === "image/gif") return "gif";
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
    video.load();
    playIfVisible();

    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", syncProgress);
      video.removeEventListener("seeking", syncProgress);
      video.removeEventListener("ended", onEnded);
    };
  }, [src, loop]);

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
        display: "block",
        ...(pixelPerfect
          ? ({ imageRendering: "crisp-edges" } as object)
          : ({ objectFit: "cover" } as object)),
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
  maxWidthPx,
  colors,
}: Props) {
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaBytes, setMediaBytes] = useState<Uint8Array | null>(null);
  const [mediaKind, setMediaKind] = useState<ResolvedMediaKind | null>(null);
  const [displayWidthPx, setDisplayWidthPx] = useState(widthPx);
  const [displayHeightPx, setDisplayHeightPx] = useState(heightPx);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const showProgress = messageMediaShowsProgressBar(contentKind);
  const pixelPerfect = isPixelPerfectMediaKind(contentKind);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setFailed(false);
    setMediaUri(null);
    setMediaBytes(null);
    setMediaKind(null);
    setDisplayWidthPx(widthPx);
    setDisplayHeightPx(heightPx);

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
        let nextWidthPx = widthPx;
        let nextHeightPx = heightPx;
        if (pixelPerfect) {
          const intrinsic = await measureWebMediaIntrinsicSize(objectUrl, kind);
          if (!cancelled && intrinsic) {
            const fitted = scaleMediaDimensions(
              intrinsic.width,
              intrinsic.height,
              maxWidthPx ?? widthPx,
              contentKind,
            );
            nextWidthPx = fitted.widthPx;
            nextHeightPx = fitted.heightPx;
          }
        }
        if (cancelled) return;
        setMediaBytes(bytes);
        setMediaKind(kind);
        setMediaUri(objectUrl);
        setDisplayWidthPx(nextWidthPx);
        setDisplayHeightPx(nextHeightPx);
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
  }, [contentKind, heightPx, maxWidthPx, pixelPerfect, uri, widthPx]);

  const frameStyle = {
    width: displayWidthPx,
    height: displayHeightPx,
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
          <MediaProgressBar widthPx={displayWidthPx} progress={0} colors={colors} />
        ) : null}
      </View>
    );
  }

  if (mediaKind === "tgs" && mediaBytes) {
    return (
      <MessageChatTgsSticker
        data={mediaBytes}
        widthPx={displayWidthPx}
        heightPx={displayHeightPx}
      />
    );
  }

  if (mediaKind === "video" && Platform.OS === "web") {
    return (
      <WebMessageChatVideo
        src={mediaUri}
        widthPx={displayWidthPx}
        heightPx={displayHeightPx}
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
        <WebMessageChatGifImage
          src={mediaUri}
          widthPx={displayWidthPx}
          heightPx={displayHeightPx}
        />
        {showProgress ? (
          <MediaProgressBar widthPx={displayWidthPx} progress={0} colors={colors} />
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
          width: displayWidthPx,
          height: displayHeightPx,
        }}
        contentFit={contentKind === "photo" ? "contain" : pixelPerfect ? "fill" : "cover"}
      />
      {showProgress ? (
        <MediaProgressBar widthPx={displayWidthPx} progress={0} colors={colors} />
      ) : null}
    </View>
  );
}

function scaleMediaDimensions(
  sourceW: number,
  sourceH: number,
  maxWidthPx: number,
  contentKind?: MessageChatContentKind,
): { widthPx: number; heightPx: number } {
  const pixelPerfect = isPixelPerfectMediaKind(contentKind ?? "other");
  let maxW = Math.min(maxWidthPx, MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX);
  if (contentKind === "sticker") {
    maxW = Math.min(maxW, MESSAGE_BUBBLE_STICKER_MAX_PX);
  } else if (contentKind === "animation") {
    maxW = Math.min(maxW, MESSAGE_BUBBLE_GIF_MAX_PX);
  }

  if (pixelPerfect) {
    const nativeW = Math.max(1, Math.round(sourceW));
    const nativeH = Math.max(1, Math.round(sourceH));
    if (nativeW <= maxW) {
      return { widthPx: nativeW, heightPx: nativeH };
    }
    const scale = maxW / nativeW;
    return {
      widthPx: Math.max(1, Math.round(nativeW * scale)),
      heightPx: Math.max(1, Math.round(nativeH * scale)),
    };
  }

  let widthPx = sourceW;
  let heightPx = sourceH;
  if (widthPx > maxW) {
    const scale = maxW / widthPx;
    widthPx = Math.max(1, Math.round(sourceW * scale));
    heightPx = Math.max(1, Math.round(sourceH * scale));
  } else {
    widthPx = Math.min(maxW, Math.max(120, Math.round(widthPx)));
    heightPx = Math.max(80, Math.min(480, Math.round(heightPx)));
  }
  if (contentKind === "photo" && heightPx > 480) {
    const scale = 480 / heightPx;
    widthPx = Math.max(1, Math.round(widthPx * scale));
    heightPx = 480;
  }
  return { widthPx, heightPx };
}

export function resolveMessageMediaDimensions(
  maxWidthPx: number,
  mediaWidth: number | null | undefined,
  mediaHeight: number | null | undefined,
  contentKind?: MessageChatContentKind,
): { widthPx: number; heightPx: number } {
  const sourceW = Math.round(Number(mediaWidth));
  const sourceH = Math.round(Number(mediaHeight));
  if (Number.isFinite(sourceW) && Number.isFinite(sourceH) && sourceW > 0 && sourceH > 0) {
    return scaleMediaDimensions(sourceW, sourceH, maxWidthPx, contentKind);
  }
  const pixelPerfect = isPixelPerfectMediaKind(contentKind ?? "other");
  if (pixelPerfect) {
    return { widthPx: 1, heightPx: 1 };
  }
  let widthPx = Math.min(maxWidthPx, MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX);
  if (contentKind === "sticker") {
    widthPx = Math.min(widthPx, MESSAGE_BUBBLE_STICKER_MAX_PX);
  } else if (contentKind === "animation") {
    widthPx = Math.min(widthPx, MESSAGE_BUBBLE_GIF_MAX_PX);
  }
  const fallbackHeight = Math.round(widthPx * 0.75);
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
