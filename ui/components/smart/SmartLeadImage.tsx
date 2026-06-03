import { Image, View, type StyleProp, type ViewStyle } from "react-native";

import { useSmartLeadLayout } from "../../smart/useSmartLeadLayout";

type Props = {
  source: number;
  style?: StyleProp<ViewStyle>;
  layoutWidthPx?: number;
};

/** Native: stretch vector to column width while keeping fixed lead height. */
export function SmartLeadImage({ source, style, layoutWidthPx = 0 }: Props) {
  const { height, onProbeLayout } = useSmartLeadLayout({ layoutWidthPx });

  return (
    <View style={{ width: "100%" }} onLayout={onProbeLayout}>
      <View
        style={[
          {
            width: "100%",
            height,
            alignSelf: "stretch",
            overflow: "hidden",
          },
          style,
        ]}
      >
        <Image source={source} style={{ width: "100%", height }} resizeMode="stretch" />
      </View>
    </View>
  );
}
