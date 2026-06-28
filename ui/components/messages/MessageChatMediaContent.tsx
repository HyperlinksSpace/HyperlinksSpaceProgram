import { useEffect, useRef, useState } from "react";
import { createElement } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { Image } from "expo-image";
import type { ThemeColors } from "../../theme";
import type { MessageChatContentKind } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX,
  MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX,
} from "./messageChatLayout";

type Props = {
  uri: string;
  contentKind: MessageChatContentKind;
  widthPx: number;
  heightPx: number;
  colors: ThemeColors;
};

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
  const clamped = Math.max(0, Math.min(1, progress));
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

function WebMessageChatVideo({
  src,
  widthPx,
  heightPx,
  colors,
  loop,
}: {
  src: string;
  widthPx: number;
  heightPx: number;
  colors: ThemeColors;
  loop: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.35, 0.6, 1] },
    );
    observer.observe(container);

    const onTimeUpdate = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        setProgress(0);
        return;
      }
      setProgress(video.currentTime / duration);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      observer.disconnect();
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [src]);

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
      preload: "auto",
      style: {
        width: widthPx,
        height: heightPx,
        objectFit: "cover",
        display: "block",
      },
    }),
    createElement(
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
    ),
  );
}

export function MessageChatMediaContent({
  uri,
  contentKind,
  widthPx,
  heightPx,
  colors,
}: Props) {
  const [blobUri, setBlobUri] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nativeProgress, setNativeProgress] = useState(0);
  const isVideoKind = contentKind === "video" || contentKind === "animation";
  const showProgress = messageMediaShowsProgressBar(contentKind);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setBlobUri(null);
    setMime(null);
    setNativeProgress(0);

    void (async () => {
      try {
        const response = await fetch(uri, { method: "GET", credentials: "include" });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const blob = await response.blob();
        if (cancelled) return;
        setMime(blob.type || response.headers.get("Content-Type"));
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("invalid_blob"));
          };
          reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
          reader.readAsDataURL(blob);
        });
        if (cancelled) return;
        setBlobUri(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri]);

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

  if (failed || !blobUri) {
    return (
      <View>
        <View style={[frameStyle, { backgroundColor: colors.highlight }]} />
        {showProgress ? (
          <MediaProgressBar widthPx={widthPx} progress={0} colors={colors} />
        ) : null}
      </View>
    );
  }

  const resolvedMime = mime ?? "";
  const showVideo =
    isVideoKind &&
    (resolvedMime.startsWith("video/") || contentKind === "video" || contentKind === "animation");

  if (showVideo && Platform.OS === "web") {
    return (
      <WebMessageChatVideo
        src={blobUri}
        widthPx={widthPx}
        heightPx={heightPx}
        colors={colors}
        loop={contentKind === "animation"}
      />
    );
  }

  return (
    <View>
      <View style={{ position: "relative" }}>
        <Image
          source={{ uri: blobUri }}
          accessibilityIgnoresInvertColors
          style={{
            width: widthPx,
            height: heightPx,
          }}
          contentFit="cover"
        />
        {showVideo ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: "rgba(0,0,0,0.45)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 18, lineHeight: 20, marginLeft: 2 }}>▶</Text>
            </View>
          </View>
        ) : null}
      </View>
      {showProgress ? (
        <MediaProgressBar widthPx={widthPx} progress={nativeProgress} colors={colors} />
      ) : null}
    </View>
  );
}

export function resolveMessageMediaDimensions(
  maxWidthPx: number,
  mediaWidth: number | null | undefined,
  mediaHeight: number | null | undefined,
): { widthPx: number; heightPx: number } {
  const widthPx = Math.min(maxWidthPx, MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX);
  const sourceW = Number(mediaWidth);
  const sourceH = Number(mediaHeight);
  if (Number.isFinite(sourceW) && Number.isFinite(sourceH) && sourceW > 0 && sourceH > 0) {
    const heightPx = Math.max(120, Math.round((widthPx * sourceH) / sourceW));
    return { widthPx, heightPx: Math.min(heightPx, 480) };
  }
  const fallbackHeight = Math.round(widthPx * 0.62);
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
