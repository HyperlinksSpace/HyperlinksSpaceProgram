import { Image, View, type StyleProp, type ViewStyle } from "react-native";

import { SMART_LEAD_HEIGHT_PX } from "../../smart/smartAssets";

type Props = {
  source: number;
  style?: StyleProp<ViewStyle>;
};

/** Native: stretch vector to column width while keeping fixed lead height. */
export function SmartLeadImage({ source, style }: Props) {
  return (
    <View
      style={[
        {
          width: "100%",
          height: SMART_LEAD_HEIGHT_PX,
          alignSelf: "stretch",
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Image
        source={source}
        style={{ width: "100%", height: SMART_LEAD_HEIGHT_PX }}
        resizeMode="stretch"
      />
    </View>
  );
}
