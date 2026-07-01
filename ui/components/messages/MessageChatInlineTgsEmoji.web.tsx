import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Text } from "react-native";
import {
  fetchTelegramEmojiAsset,
  type TelegramEmojiFetchRef,
} from "./fetchTelegramEmojiBytes";
import { bytesLookLikeTgs } from "./loadTgsAnimation";
import { getCachedTgsAnimationFromBytes } from "./tgsAnimationCache";
import { TgsCanvasPlayer } from "./TgsCanvasPlayer.web";
import { telegramEmojiDebug } from "./telegramEmojiDebug";
import { useElementVisible } from "./useElementVisible";

type Props = {
  customEmojiId?: string;
  emoji?: string;
  sizePx: number;
  fallbackText?: string;
  lowPriority?: boolean;
  /** Premium/status emoji beside usernames — always paint even when off-screen. */
  priority?: boolean;
  /** Parent can defer fetches until the row is visible. */
  fetchEnabled?: boolean;
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

function isLikelyCustomEmojiPlaceholder(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/\p{Extended_Pictographic}/u.test(trimmed)) return false;
  if (trimmed.length <= 2) {
    const codePoint = trimmed.codePointAt(0);
    if (codePoint == null) return true;
    if (codePoint >= 0xe000 && codePoint <= 0xf8ff) return true;
  }
  return false;
}

/** Inline Telegram emoji sticker (.tgs / .webm / static) on web. */
export function MessageChatInlineTgsEmoji(props: Props) {
  const {
    sizePx,
    fallbackText = "",
    lowPriority = false,
    priority = false,
    fetchEnabled = true,
  } = props;
  const fetchRef = useMemo(() => resolveFetchRef(props), [props.customEmojiId, props.emoji]);
  const hostRef = useRef<HTMLSpanElement>(null);
  const visible = useElementVisible(hostRef as RefObject<Element | null>, {
    enabled: !priority,
    rootMargin: "96px",
  });
  const shouldFetch = fetchEnabled && (priority || visible);
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"video" | "image" | null>(null);
  const [fetchSettled, setFetchSettled] = useState(false);

  const displayFallback = useMemo(() => {
    const fromEmoji = props.emoji?.trim();
    if (fromEmoji) return fromEmoji;
    const trimmed = fallbackText.trim();
    if (trimmed && !isLikelyCustomEmojiPlaceholder(trimmed)) return trimmed;
    return "🎭";
  }, [fallbackText, props.emoji]);

  useEffect(() => {
    let cancelled = false;
    setAnimationData(null);
    setMediaUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setMediaKind(null);
    setFetchSettled(false);

    if (!fetchRef || !shouldFetch) {
      if (!fetchRef) {
        telegramEmojiDebug.inlineNoRef("web", props);
      }
      return;
    }

    void fetchTelegramEmojiAsset(fetchRef)
      .then(async (asset) => {
        if (cancelled) return;
        if (!asset) {
          telegramEmojiDebug.inlineAssetNull(fetchRef, "web");
          return;
        }
        if (
          asset.mime === "application/x-tgsticker" ||
          asset.mime.endsWith("+tgs") ||
          bytesLookLikeTgs(asset.bytes)
        ) {
          telegramEmojiDebug.inlineDecode(fetchRef, "tgs", asset.mime, asset.bytes.length);
          try {
            const parsed = await getCachedTgsAnimationFromBytes(asset.bytes);
            if (!cancelled) setAnimationData(parsed);
          } catch (err) {
            telegramEmojiDebug.inlineTgsParseFail(fetchRef, err);
          }
          return;
        }
        if (isVideoMime(asset.mime)) {
          telegramEmojiDebug.inlineDecode(fetchRef, "video", asset.mime, asset.bytes.length);
          const blob = new Blob([Uint8Array.from(asset.bytes)], { type: asset.mime });
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
          telegramEmojiDebug.inlineDecode(fetchRef, "image", asset.mime, asset.bytes.length);
          const blob = new Blob([Uint8Array.from(asset.bytes)], { type: asset.mime });
          const url = URL.createObjectURL(blob);
          if (!cancelled) {
            setMediaUrl(url);
            setMediaKind("image");
          } else {
            URL.revokeObjectURL(url);
          }
          return;
        }
        telegramEmojiDebug.inlineDecode(fetchRef, "unsupported", asset.mime, asset.bytes.length);
      })
      .catch((err) => {
        telegramEmojiDebug.fetchNetworkError(fetchRef, err);
      })
      .finally(() => {
        if (!cancelled) setFetchSettled(true);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchRef, shouldFetch]);

  useEffect(() => {
    if (!fetchRef || !fetchSettled || animationData || mediaUrl) return;
    telegramEmojiDebug.inlineFallback(fetchRef, displayFallback, "web_after_fetch");
  }, [animationData, displayFallback, fetchRef, fetchSettled, mediaUrl]);

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);

  const hostStyle: CSSProperties = {
    display: "inline-block",
    width: sizePx,
    height: sizePx,
    verticalAlign: "text-bottom",
    lineHeight: 1,
    position: "relative",
    flexShrink: 0,
  };

  return (
    <span ref={hostRef} style={hostStyle}>
      {animationData ? (
        <TgsCanvasPlayer
          animationData={animationData}
          widthPx={sizePx}
          heightPx={sizePx}
          lowPriority={lowPriority}
          priority={priority}
          style={{
            display: "block",
            width: sizePx,
            height: sizePx,
          }}
        />
      ) : null}
      {mediaUrl && mediaKind === "video" ? (
        <video
          src={mediaUrl}
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: sizePx,
            height: sizePx,
            display: "block",
            objectFit: "contain",
          }}
        />
      ) : null}
      {mediaUrl && mediaKind === "image" ? (
        <img
          src={mediaUrl}
          alt={displayFallback}
          style={{
            width: sizePx,
            height: sizePx,
            display: "block",
            objectFit: "contain",
          }}
        />
      ) : null}
      {!animationData && !mediaUrl && fetchSettled ? (
        <Text
          style={{
            fontSize: Math.round(sizePx * 0.85),
            lineHeight: sizePx,
            textAlign: "center",
          }}
        >
          {displayFallback}
        </Text>
      ) : null}
    </span>
  );
}
