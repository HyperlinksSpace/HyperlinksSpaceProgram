import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { getCachedTgsAnimationFromBytes } from "./tgsAnimationCache";
import { TgsCanvasPlayer } from "./TgsCanvasPlayer.web";
import { useElementVisible } from "./useElementVisible.web";

type Props = {
  data: Uint8Array;
  widthPx: number;
  heightPx: number;
  lowPriority?: boolean;
};

/** Looping Telegram `.tgs` sticker (web). */
export function MessageChatTgsSticker({ data, widthPx, heightPx, lowPriority = false }: Props) {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const visible = useElementVisible(hostRef);

  useEffect(() => {
    let cancelled = false;
    setAnimationData(null);
    if (!visible) return;
    void getCachedTgsAnimationFromBytes(data)
      .then((parsed) => {
        if (!cancelled) setAnimationData(parsed);
      })
      .catch(() => {
        /* leave empty slot */
      });
    return () => {
      cancelled = true;
    };
  }, [data, visible]);

  return (
    <View ref={hostRef as never} style={{ width: widthPx, height: heightPx }}>
      {animationData ? (
        <TgsCanvasPlayer
          animationData={animationData}
          widthPx={widthPx}
          heightPx={heightPx}
          lowPriority={lowPriority}
        />
      ) : null}
    </View>
  );
}
