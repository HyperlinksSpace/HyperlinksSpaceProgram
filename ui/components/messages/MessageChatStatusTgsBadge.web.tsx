import { useEffect, useState } from "react";
import { View } from "react-native";
import Lottie from "lottie-react";
import { loadStatusTgsAnimation } from "./loadStatusTgsAnimation";

type Props = {
  size?: number;
};

/** Looping Telegram status sticker from `assets/status.tgs` (web). */
export function MessageChatStatusTgsBadge({ size = 20 }: Props) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStatusTgsAnimation()
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
    <Lottie
      animationData={animationData}
      loop
      autoplay
      style={{ width: size, height: size }}
      rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
    />
  );
}
