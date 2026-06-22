import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image";
import type { ThemeColors } from "../../theme";
import { MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX } from "./messageChatLayout";

type Props = {
  uri: string;
  widthPx: number;
  heightPx: number;
  colors: ThemeColors;
};

export function MessageChatMediaImage({ uri, widthPx, heightPx, colors }: Props) {
  const [blobUri, setBlobUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setBlobUri(null);

    void (async () => {
      try {
        const response = await fetch(uri, { method: "GET", credentials: "include" });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const blob = await response.blob();
        if (cancelled) return;
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

  if (loading) {
    return (
      <View
        style={{
          width: widthPx,
          height: heightPx,
          borderRadius: MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.highlight,
        }}
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (failed || !blobUri) {
    return (
      <View
        style={{
          width: widthPx,
          height: heightPx,
          borderRadius: MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX,
          backgroundColor: colors.highlight,
        }}
      />
    );
  }

  return (
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
  );
}
