import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Lottie from "lottie-react";
import {
  fetchTelegramEmojiAsset,
  type TelegramEmojiFetchRef,
} from "./fetchTelegramEmojiBytes";
import { loadTgsAnimationFromBytes, bytesLookLikeTgs } from "./loadTgsAnimation";

type Props = {
  customEmojiId?: string;
  emoji?: string;
  sizePx: number;
  fallbackText?: string;
};

function resolveFetchRef(props: Props): TelegramEmojiFetchRef | null {
  const customEmojiId = props.customEmojiId?.trim();
  if (customEmojiId) return { kind: "custom", customEmojiId };
  const emoji = props.emoji?.trim();
  if (emoji) return { kind: "animated", emoji };
  return null;
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

/** Inline Telegram emoji sticker (.tgs / .webm / static) on web. */
export function MessageChatInlineTgsEmoji(props: Props) {
  const { sizePx, fallbackText = "" } = props;
  const fetchRef = useMemo(() => resolveFetchRef(props), [props.customEmojiId, props.emoji]);
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"video" | "image" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnimationData(null);
    setMediaUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setMediaKind(null);

    if (!fetchRef) return;

    void fetchTelegramEmojiAsset(fetchRef)
      .then(async (asset) => {
        if (cancelled || !asset) return;
        if (
          asset.mime === "application/x-tgsticker" ||
          asset.mime.endsWith("+tgs") ||
          bytesLookLikeTgs(asset.bytes)
        ) {
          const parsed = await loadTgsAnimationFromBytes(asset.bytes);
          if (!cancelled) setAnimationData(parsed);
          return;
        }
        if (isVideoMime(asset.mime)) {
          const blob = new Blob([asset.bytes], { type: asset.mime });
          const url = URL.createObjectURL(blob);
          if (!cancelled) {
            setMediaUrl(url);
            setMediaKind("video");
          } else {
            URL.revokeObjectURL(url);
          }
          return;
        }
        if (isImageMime(asset.mime)) {
          const blob = new Blob([asset.bytes], { type: asset.mime });
          const url = URL.createObjectURL(blob);
          if (!cancelled) {
            setMediaUrl(url);
            setMediaKind("image");
          } else {
            URL.revokeObjectURL(url);
          }
        }
      })
      .catch(() => {
        /* leave fallback */
      });

    return () => {
      cancelled = true;
    };
  }, [fetchRef]);

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);

  if (animationData) {
    return (
      <Lottie
        animationData={animationData}
        loop
        autoplay
        style={{
          width: sizePx,
          height: sizePx,
          display: "inline-block",
          verticalAlign: "text-bottom",
        }}
        rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
      />
    );
  }

  if (mediaUrl && mediaKind === "video") {
    return (
      <video
        src={mediaUrl}
        autoPlay
        loop
        muted
        playsInline
        style={{
          width: sizePx,
          height: sizePx,
          display: "inline-block",
          verticalAlign: "text-bottom",
          objectFit: "contain",
        }}
      />
    );
  }

  if (mediaUrl && mediaKind === "image") {
    return (
      <img
        src={mediaUrl}
        alt={fallbackText || "emoji"}
        style={{
          width: sizePx,
          height: sizePx,
          display: "inline-block",
          verticalAlign: "text-bottom",
          objectFit: "contain",
        }}
      />
    );
  }

  if (fallbackText) {
    return (
      <Text style={{ fontSize: Math.round(sizePx * 0.85), lineHeight: sizePx }}>{fallbackText}</Text>
    );
  }
  return <View style={{ width: sizePx, height: sizePx }} />;
}
