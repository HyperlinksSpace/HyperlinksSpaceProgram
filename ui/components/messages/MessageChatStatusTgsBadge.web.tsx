import { useEffect, useState } from "react";
import { View } from "react-native";
import { loadStatusTgsAnimation } from "./loadStatusTgsAnimation";
import { getCachedTgsAnimationByKey } from "./tgsAnimationCache";
import { TgsCanvasPlayer } from "./TgsCanvasPlayer.web";

type Props = {
  size?: number;
};

const STATUS_TGS_CACHE_KEY = "asset:status.tgs";

/** Looping Telegram status sticker from `assets/status.tgs` (web). */
export function MessageChatStatusTgsBadge({ size = 20 }: Props) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCachedTgsAnimationByKey(STATUS_TGS_CACHE_KEY, loadStatusTgsAnimation)
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        /* leave empty slot */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!animationData) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    <TgsCanvasPlayer animationData={animationData} widthPx={size} heightPx={size} lowPriority />
  );
}
