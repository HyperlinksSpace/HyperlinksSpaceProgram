import { useEffect, useState } from "react";
import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";

function needsAuthenticatedFetch(uri: string): boolean {
  return uri.includes("/api/telegram-messages-avatar");
}

type Props = {
  uri: string;
  sizePx: number;
  style?: StyleProp<ImageStyle>;
  onLoad?: () => void;
  onError?: (error?: unknown) => void;
};

/** Renders chat avatars; API proxy URLs are fetched with session cookies (required on web). */
export function MessageChatAvatarImage({ uri, sizePx, style, onLoad, onError }: Props) {
  const [displayUri, setDisplayUri] = useState<string | null>(
    needsAuthenticatedFetch(uri) ? null : uri,
  );

  useEffect(() => {
    if (!needsAuthenticatedFetch(uri)) {
      setDisplayUri(uri);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setDisplayUri(null);

    void (async () => {
      try {
        const response = await fetch(uri, { method: "GET", credentials: "include" });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setDisplayUri(objectUrl);
      } catch (err) {
        if (!cancelled) onError?.(err);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uri, onError]);

  if (!displayUri) return null;

  return (
    <Image
      source={{ uri: displayUri }}
      accessibilityIgnoresInvertColors
      onLoad={onLoad}
      onError={(event) => onError?.(event.error ?? "unknown_avatar_error")}
      style={[{ width: sizePx, height: sizePx, borderRadius: sizePx / 2 }, style]}
      contentFit="cover"
    />
  );
}
