import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { MessageChatArtSignIconSvg } from "./MessageChatArtSignIconSvg";

type Props = {
  size?: number;
};

/** Artist palette badge with Reanimated 3D tumble (native). */
export function MessageChatArtSignIcon({ size = 20 }: Props) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    );
  }, [spin]);

  const animatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(spin.value, [0, 0.33, 0.66, 1], [-28, 38, 198, 332]);
    const rotateX = interpolate(spin.value, [0, 0.5, 1], [12, -9, 12]);
    const rotateZ = interpolate(spin.value, [0, 0.5, 1], [0, 5, 0]);
    const translateY = interpolate(spin.value, [0, 0.5, 1], [0, -0.6, 0]);

    return {
      transform: [
        { perspective: 96 },
        { translateY },
        { rotateX: `${rotateX}deg` },
        { rotateY: `${rotateY}deg` },
        { rotateZ: `${rotateZ}deg` },
      ],
    };
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
        <MessageChatArtSignIconSvg size={size} idSuffix="Native" />
      </Animated.View>
    </View>
  );
}
