import { useEffect, useState } from "react";
import { createElement } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { Image } from "expo-image";
import type { ThemeColors } from "../../theme";
import { WEB_UI_SANS_STACK } from "../../fonts";
import type { MessageChatContentKind } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX,
  MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX,
} from "./messageChatLayout";

type Props = {
  uri: string;
  contentKind: MessageChatContentKind;
  widthPx: number;
  heightPx: number;
  colors: ThemeColors;
};

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
  const isVideo = contentKind === "video" || contentKind === "animation";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setBlobUri(null);
    setMime(null);

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
    borderRadius: MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX,
    overflow: "hidden" as const,
    backgroundColor: colors.highlight,
  };

  if (loading) {
    return (
      <View style={[frameStyle, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (failed || !blobUri) {
    return <View style={frameStyle} />;
  }

  const resolvedMime = mime ?? "";
  const showVideo =
    isVideo &&
    (resolvedMime.startsWith("video/") || contentKind === "video" || contentKind === "animation");

  if (showVideo && Platform.OS === "web") {
    return createElement(
      "div",
      {
        style: {
          ...frameStyle,
          position: "relative",
        },
      },
      createElement("video", {
        src: blobUri,
        playsInline: true,
        muted: true,
        controls: true,
        preload: "metadata",
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          borderRadius: MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX,
        },
      }),
    );
  }

  return (
    <View style={{ position: "relative" }}>
      <Image
        source={{ uri: blobUri }}
        accessibilityIgnoresInvertColors
        style={{
          width: widthPx,
          height: heightPx,
          borderRadius: MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX,
        }}
        contentFit="cover"
      />
      {isVideo ? (
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
