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

function shouldMeasureIntrinsicMediaSize(contentKind: MessageChatContentKind): boolean {
  return isPixelPerfectMediaKind(contentKind) || contentKind === "photo" || contentKind === "video";
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

function isStreamableVideoContentKind(contentKind: MessageChatContentKind): boolean {
  return contentKind === "video" || contentKind === "animation";
}

export function resolvePreviewMediaUrl(uri: string): string {
  if (/[?&]preview=1(?:&|$)/.test(uri)) return uri;
  return `${uri}${uri.includes("?") ? "&" : "?"}preview=1`;
}

async function fetchMediaBlob(
  uri: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const response = await fetch(uri, { method: "GET", credentials: "include" });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    mime: (blob.type || response.headers.get("Content-Type") || "").trim(),
  };
}

function createObjectUrl(bytes: Uint8Array, mime: string, kind: ResolvedMediaKind): string {
  const blobType =
    kind === "video"
      ? mime.startsWith("video/")
        ? mime
        : "video/mp4"
      : kind === "tgs"
        ? "application/x-tgsticker"
        : mime || "application/octet-stream";
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: blobType }));
}

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
    ((contentKind === "video" || contentKind === "animation") && bytesLookLikeVideo(bytes))
  ) {
    return "video";
  }
  if (normalizedMime === "image/gif") return "gif";
  if (contentKind === "sticker" && bytesLookLikeVideo(bytes)) return "video";
  return "image";
}

function WebMessageChatVideo({
  src,
  posterSrc,
  widthPx,
  heightPx,
  colors,
  loop,
  showProgress,
  pixelPerfect,
}: {
  src?: string | null;
  posterSrc?: string | null;
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
  const [posterVisible, setPosterVisible] = useState(Boolean(posterSrc));

  useEffect(() => {
    setPosterVisible(Boolean(posterSrc));
  }, [posterSrc, src]);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !src) return;

    const playIfVisible = () => {
      video.muted = true;
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
        if (entry.isIntersecting) {
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.05, 0.15, 0.35, 0.6, 1] },
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

    const onPlaying = () => {
      setPosterVisible(false);
    };
    const onLoadedData = () => {
      playIfVisible();
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

    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("canplaythrough", onCanPlay);
    video.addEventListener("timeupdate", syncProgress);
    video.addEventListener("seeking", syncProgress);
    video.addEventListener("ended", onEnded);
    video.load();
    playIfVisible();

    return () => {
      observer.disconnect();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("canplaythrough", onCanPlay);
      video.removeEventListener("timeupdate", syncProgress);
      video.removeEventListener("seeking", syncProgress);
      video.removeEventListener("ended", onEnded);
    };
  }, [src, loop]);

  return createElement(
    "div",
    {
      key: src ?? posterSrc ?? "video",
      ref: containerRef,
      style: {
        width: widthPx,
        display: "flex",
        flexDirection: "column",
        position: "relative",
      },
    },
    posterVisible && posterSrc
      ? createElement("img", {
          src: posterSrc,
          alt: "",
          width: widthPx,
          height: heightPx,
          style: {
            width: widthPx,
            height: heightPx,
            display: "block",
            position: src ? ("absolute" as const) : ("relative" as const),
            inset: src ? 0 : undefined,
            zIndex: 1,
            pointerEvents: "none",
            ...(pixelPerfect
              ? ({ objectFit: "cover", imageRendering: "crisp-edges" } as object)
              : ({ objectFit: "cover" } as object)),
          },
        })
      : null,
    src
      ? createElement("video", {
          key: src,
          ref: videoRef,
          src,
          playsInline: true,
          muted: true,
          defaultMuted: true,
          loop,
          autoPlay: true,
          preload: "auto",
          disablePictureInPicture: true,
          style: {
            width: widthPx,
            height: heightPx,
            display: "block",
            position: "relative",
            zIndex: 0,
            ...(pixelPerfect
              ? ({ imageRendering: "crisp-edges" } as object)
              : ({ objectFit: "cover" } as object)),
          },
        })
      : null,
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

function WebMessageChatPhotoImage({
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
    },
  });
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
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [mediaBytes, setMediaBytes] = useState<Uint8Array | null>(null);
  const [mediaKind, setMediaKind] = useState<ResolvedMediaKind | null>(null);
  const [displayWidthPx, setDisplayWidthPx] = useState(widthPx);
  const [displayHeightPx, setDisplayHeightPx] = useState(heightPx);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const showProgress = messageMediaShowsProgressBar(contentKind);
  const pixelPerfect = isPixelPerfectMediaKind(contentKind);
  const usesVideoPreview = isStreamableVideoContentKind(contentKind);

  useEffect(() => {
    let cancelled = false;
    let mediaObjectUrl: string | null = null;
    let previewObjectUrl: string | null = null;
    setLoading(true);
    setFailed(false);
    setMediaUri(null);
    setPreviewUri(null);
    setMediaBytes(null);
    setMediaKind(null);
    setDisplayWidthPx(widthPx);
    setDisplayHeightPx(heightPx);

    const applyIntrinsicDimensions = async (
      objectUrl: string,
      measureKind: ResolvedMediaKind,
    ) => {
      if (!shouldMeasureIntrinsicMediaSize(contentKind)) return;
      const intrinsic = await measureWebMediaIntrinsicSize(objectUrl, measureKind);
      if (cancelled || !intrinsic) return;
      const fitted = scaleMediaDimensions(
        intrinsic.width,
        intrinsic.height,
        maxWidthPx ?? widthPx,
        contentKind,
      );
      setDisplayWidthPx(fitted.widthPx);
      setDisplayHeightPx(fitted.heightPx);
    };

    void (async () => {
      try {
        if (usesVideoPreview) {
          let hasPreview = false;

          void (async () => {
            try {
              const { bytes, mime } = await fetchMediaBlob(resolvePreviewMediaUrl(uri));
              if (cancelled) return;
              previewObjectUrl = createObjectUrl(bytes, mime, "image");
              hasPreview = true;
              setPreviewUri(previewObjectUrl);
              await applyIntrinsicDimensions(previewObjectUrl, "image");
              if (!cancelled) setLoading(false);
            } catch {
              /* preview is optional */
            }
          })();

          try {
            const { bytes, mime } = await fetchMediaBlob(uri);
            if (cancelled) return;
            const kind = resolveMediaKind(bytes, contentKind, mime);
            if (kind !== "video") throw new Error("VIDEO_NOT_READY");
            mediaObjectUrl = createObjectUrl(bytes, mime, kind);
            await applyIntrinsicDimensions(mediaObjectUrl, "video");
            if (cancelled) return;
            setMediaBytes(bytes);
            setMediaKind(kind);
            setMediaUri(mediaObjectUrl);
            setLoading(false);
          } catch {
            for (let i = 0; i < 10 && !hasPreview && !cancelled; i++) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            if (!cancelled && !hasPreview) setFailed(true);
          }
          return;
        }

        const { bytes, mime } = await fetchMediaBlob(uri);
        if (cancelled) return;
        const kind = resolveMediaKind(bytes, contentKind, mime);
        mediaObjectUrl = createObjectUrl(bytes, mime, kind);
        await applyIntrinsicDimensions(
          mediaObjectUrl,
          kind === "video" ? "video" : kind === "gif" ? "gif" : "image",
        );
        if (cancelled) return;
        setMediaBytes(bytes);
        setMediaKind(kind);
        setMediaUri(mediaObjectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [contentKind, heightPx, maxWidthPx, uri, usesVideoPreview, widthPx]);

  const frameStyle = {
    width: displayWidthPx,
    height: displayHeightPx,
    overflow: "hidden" as const,
    backgroundColor: "transparent",
  };

  if (loading && !previewUri) {
    return (
      <View style={[frameStyle, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (failed && !previewUri && (!mediaUri || !mediaKind)) {
    return (
      <View>
        <View style={[frameStyle, { backgroundColor: colors.highlight }]} />
        {showProgress ? (
          <MediaProgressBar widthPx={displayWidthPx} progress={0} colors={colors} />
        ) : null}
      </View>
    );
  }

  if (usesVideoPreview && Platform.OS === "web" && (previewUri || mediaUri)) {
    return (
      <WebMessageChatVideo
        src={mediaUri}
        posterSrc={previewUri}
        widthPx={displayWidthPx}
        heightPx={displayHeightPx}
        colors={colors}
        loop
        showProgress={showProgress}
        pixelPerfect={pixelPerfect}
      />
    );
  }

  if (!mediaUri || !mediaKind) {
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

  if (mediaKind === "image" && contentKind === "photo" && Platform.OS === "web") {
    return (
      <View>
        <WebMessageChatPhotoImage
          src={mediaUri}
          widthPx={displayWidthPx}
          heightPx={displayHeightPx}
        />
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

  const nativeW = Math.max(1, Math.round(sourceW));
  const nativeH = Math.max(1, Math.round(sourceH));

  if (pixelPerfect || contentKind === "photo") {
    let fitW = nativeW;
    let fitH = nativeH;
    if (contentKind === "photo" && fitH > 480) {
      const scale = 480 / fitH;
      fitW = Math.max(1, Math.round(fitW * scale));
      fitH = 480;
    }
    if (fitW <= maxW) {
      return { widthPx: fitW, heightPx: fitH };
    }
    const scale = maxW / fitW;
    return {
      widthPx: Math.max(1, Math.round(fitW * scale)),
      heightPx: Math.max(1, Math.round(fitH * scale)),
    };
  }

  if (contentKind === "video") {
    if (nativeW <= maxW) {
      return { widthPx: nativeW, heightPx: nativeH };
    }
    const scale = maxW / nativeW;
    return {
      widthPx: Math.max(1, Math.round(nativeW * scale)),
      heightPx: Math.max(1, Math.round(nativeH * scale)),
    };
  }

  let widthPx = nativeW;
  let heightPx = nativeH;
  if (widthPx > maxW) {
    const scale = maxW / widthPx;
    widthPx = Math.max(1, Math.round(nativeW * scale));
    heightPx = Math.max(1, Math.round(nativeH * scale));
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
  if (pixelPerfect || contentKind === "photo" || contentKind === "video") {
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
