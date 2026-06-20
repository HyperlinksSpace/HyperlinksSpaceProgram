import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { uiIconButtonVerticalCompensationTransform } from "../theme";

/** Matches `assets/Arrow.svg` (viewBox 0 0 10 14). */
const ARROW_PATH_D =
  "M0.28095 5.10937C-0.0936502 4.72152 -0.093651 3.99625 0.28095 3.6084L2.81708 0.982422C4.08681 -0.332053 5.91258 -0.332035 7.18232 0.982422L9.71845 3.6084C10.093 3.99625 10.0931 4.72152 9.71845 5.10937C9.43637 5.40111 9.03078 5.40116 8.74872 5.10937L7.11689 3.41895C6.77833 3.06845 6.39738 2.81793 5.9997 2.66016L5.9997 13C5.9997 13.5523 5.55199 14 4.9997 14C4.44742 14 3.9997 13.5523 3.9997 13L3.9997 2.66016C3.60203 2.81793 3.22106 3.06845 2.88251 3.41895L1.25068 5.10937C0.968618 5.40117 0.563032 5.40111 0.28095 5.10937Z";

const CIRCLE_SIZE = 30;
/** Strict on-screen size: 10×14 (width × height), matches `viewBox` 1:1. */
const ARROW_WIDTH = 10;
const ARROW_HEIGHT = 14;

type Props = {
  iconColor: string;
  undercoverColor: string;
  onPress: () => void;
  wrapStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Degrees clockwise; chat compose uses -45 for upper-right diagonal. */
  iconRotationDeg?: number;
};

/**
 * Global bottom bar send control: `Arrow.svg` on a fixed 30×30 `undercover` circle, icon in `primary`
 * (passed as `iconColor`). Outer {@link Pressable} keeps the same wrap + optical nudge as the legacy arrow.
 */
export function BottomBarSendCircleButton({
  iconColor,
  undercoverColor,
  onPress,
  wrapStyle,
  accessibilityLabel = "Send",
  iconRotationDeg = 0,
}: Props) {
  return (
    <Pressable
      style={[uiIconButtonVerticalCompensationTransform, wrapStyle]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={{
          width: CIRCLE_SIZE,
          height: CIRCLE_SIZE,
          borderRadius: CIRCLE_SIZE / 2,
          backgroundColor: undercoverColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={
            iconRotationDeg !== 0
              ? { transform: [{ rotate: `${iconRotationDeg}deg` }] }
              : undefined
          }
        >
          <Svg
            width={ARROW_WIDTH}
            height={ARROW_HEIGHT}
            viewBox="0 0 10 14"
            preserveAspectRatio="xMidYMid meet"
            fill="none"
          >
            <Path d={ARROW_PATH_D} fill={iconColor} />
          </Svg>
        </View>
      </View>
    </Pressable>
  );
}
