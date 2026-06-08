import { Text, View, type StyleProp, type TextStyle } from "react-native";

import { typographyRect15 } from "../../theme";
import { SMART_FORM_BOTTOM_TEXT_LANE_HEIGHT_PX } from "./SmartFormBottomTextLane";

const CAPS_LABEL_FONT_SIZE_PX = 15;
const CAPS_LABEL_LETTER_SPACING_EM = 0.15;

type Props = {
  children: string;
  color: string;
  style?: StyleProp<TextStyle>;
};

/** Uppercase field label with 15% tracking — Smart founder form copy. */
export function SmartFormCapsLabel({ children, color, style }: Props) {
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
            fontSize: CAPS_LABEL_FONT_SIZE_PX,
            lineHeight: 18,
            fontWeight: "400",
            color,
            textTransform: "uppercase",
            letterSpacing: CAPS_LABEL_FONT_SIZE_PX * CAPS_LABEL_LETTER_SPACING_EM,
          },
          style,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
