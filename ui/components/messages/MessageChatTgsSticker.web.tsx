import { useEffect, useState } from "react";
import { View } from "react-native";
import Lottie from "lottie-react";
import { loadTgsAnimationFromBytes } from "./loadTgsAnimation";

type Props = {
  data: Uint8Array;
  widthPx: number;
  heightPx: number;
};

/** Looping Telegram `.tgs` sticker (web). */
export function MessageChatTgsSticker({ data, widthPx, heightPx }: Props) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnimationData(null);
    void loadTgsAnimationFromBytes(data)
      .then((parsed) => {
        if (!cancelled) setAnimationData(parsed);
      })
      .catch(() => {
        /* leave empty slot */
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!animationData) {
    return <View style={{ width: widthPx, height: heightPx }} />;
  }

  return (
    <Lottie
      animationData={animationData}
      loop
      autoplay
      style={{ width: widthPx, height: heightPx }}
      rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
    />
  );
}
