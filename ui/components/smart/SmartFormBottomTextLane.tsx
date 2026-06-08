import { Text, View, type StyleProp, type TextStyle } from "react-native";

import { typographyRect15 } from "../../theme";

export const SMART_FORM_BOTTOM_TEXT_LANE_HEIGHT_PX = 28;

type Props = {
  children: string;
  color: string;
  style?: StyleProp<TextStyle>;
};

/** Full-width 28px lane; label text sits on the bottom edge (Smart company form copy). */
export function SmartFormBottomTextLane({ children, color, style }: Props) {
  return (
    <View
      style={{
        width: "100%",
        alignSelf: "stretch",
        height: SMART_FORM_BOTTOM_TEXT_LANE_HEIGHT_PX,
        justifyContent: "flex-end",
      }}
    >
      <Text
        style={[
          typographyRect15,
          {
            fontSize: 15,
            lineHeight: 18,
            fontWeight: "400",
            color,
          },
          style,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
