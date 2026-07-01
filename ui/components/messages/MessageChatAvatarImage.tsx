import { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";
import { runQueuedNetworkFetch } from "./networkFetchQueue";

function needsAuthenticatedFetch(uri: string): boolean {
  return uri.includes("/api/telegram-messages-avatar");
}

/** Reuse blob URLs so avatar proxy images do not refetch on every list re-render. */
const avatarBlobCache = new Map<string, string>();

function readCachedDisplayUri(uri: string): string | null {
  if (!needsAuthenticatedFetch(uri)) return uri;
  return avatarBlobCache.get(uri) ?? null;
}

type Props = {
  uri: string;
  sizePx: number;
  style?: StyleProp<ImageStyle>;
  /** When false, skip proxy fetch until the row scrolls into view. */
  loadEnabled?: boolean;
  onLoad?: () => void;
  onError?: (error?: unknown) => void;
};

/** Renders chat avatars; API proxy URLs are fetched with session cookies (required on web). */
export function MessageChatAvatarImage({
  uri,
  sizePx,
  style,
  loadEnabled = true,
  onLoad,
  onError,
}: Props) {
  const [displayUri, setDisplayUri] = useState<string | null>(() => readCachedDisplayUri(uri));
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onLoadRef.current = onLoad;
    onErrorRef.current = onError;
  }, [onLoad, onError]);

  useEffect(() => {
    if (!loadEnabled) return;

    if (!needsAuthenticatedFetch(uri)) {
      setDisplayUri(uri);
      return;
    }

    const cached = avatarBlobCache.get(uri);
    if (cached) {
      setDisplayUri(cached);
      return;
    }

    let cancelled = false;

    void runQueuedNetworkFetch(async () => {
      try {
        const response = await fetch(uri, { method: "GET", credentials: "include" });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        avatarBlobCache.set(uri, objectUrl);
        if (!cancelled) setDisplayUri(objectUrl);
      } catch (err) {
        if (!cancelled) onErrorRef.current?.(err);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [uri, loadEnabled]);

  if (!displayUri) return null;

  return (
    <Image
      source={{ uri: displayUri }}
      accessibilityIgnoresInvertColors
      onLoad={() => onLoadRef.current?.()}
      onError={(event) => onErrorRef.current?.(event.error ?? "unknown_avatar_error")}
      style={[{ width: sizePx, height: sizePx, borderRadius: 0 }, style]}
      contentFit="cover"
    />
  );
}
