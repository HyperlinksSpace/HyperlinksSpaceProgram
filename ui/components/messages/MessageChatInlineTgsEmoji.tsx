import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import {
  fetchTelegramEmojiAsset,
  type TelegramEmojiFetchRef,
} from "./fetchTelegramEmojiBytes";

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

/** Native fallback: Unicode placeholder until TGS/WebM playback is implemented. */
export function MessageChatInlineTgsEmoji({
  customEmojiId,
  emoji,
  sizePx,
  fallbackText = "",
}: Props) {
  const fetchRef = useMemo(
    () => resolveFetchRef({ customEmojiId, emoji, sizePx, fallbackText }),
    [customEmojiId, emoji, sizePx, fallbackText],
  );
  const [loadedFallback, setLoadedFallback] = useState(fallbackText);

  useEffect(() => {
    let cancelled = false;
    if (!fetchRef) return;
    void fetchTelegramEmojiAsset(fetchRef)
      .then((asset) => {
        if (cancelled || !asset) return;
        setLoadedFallback(fallbackText || emoji || "🎭");
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [fetchRef, fallbackText, emoji]);

  if (loadedFallback) {
    return (
      <Text style={{ fontSize: Math.round(sizePx * 0.85), lineHeight: sizePx }}>
        {loadedFallback}
      </Text>
    );
  }
  return <View style={{ width: sizePx, height: sizePx }} />;
}
