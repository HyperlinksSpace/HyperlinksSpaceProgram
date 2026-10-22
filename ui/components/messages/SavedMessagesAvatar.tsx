import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Telegram Desktop Saved Messages face — blue disc + white bookmark. */
export const SAVED_MESSAGES_AVATAR_BLUE = "#3390EC";

type Props = {
  sizePx: number;
};

/** Bookmark glyph sized for a circular avatar face. */
export function SavedMessagesAvatar({ sizePx }: Props) {
  const icon = Math.max(12, Math.round(sizePx * 0.48));
  return (
    <View
      style={{
        width: sizePx,
        height: sizePx,
        borderRadius: sizePx / 2,
        backgroundColor: SAVED_MESSAGES_AVATAR_BLUE,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
        <Path
          d="M7 3.5h10a1 1 0 0 1 1 1v15.2l-6-3.8-6 3.8V4.5a1 1 0 0 1 1-1Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}
