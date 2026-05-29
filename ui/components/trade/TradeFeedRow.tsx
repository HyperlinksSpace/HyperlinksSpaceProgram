import { Image } from "expo-image";
import { Platform, Text, View } from "react-native";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import type { ThemeColors } from "../../theme";
import type { TradeFeedItem } from "../../trade/tradeSampleData";

const ICON_PX = 40;
const ICON_TEXT_GAP_PX = 10;
const LINE_HEIGHT_PX = 20;
const FONT_SIZE_PX = 15;
const ROW_GAP_PX = 22;

const textBase = {
  fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
  fontSize: FONT_SIZE_PX,
  lineHeight: LINE_HEIGHT_PX,
  includeFontPadding: false,
  paddingVertical: 0,
} as const;

export function TradeFeedRow({
  item,
  icon,
  colors,
  isLast,
}: {
  item: TradeFeedItem;
  icon: number;
  colors: ThemeColors;
  isLast: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: isLast ? 0 : ROW_GAP_PX,
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      <Image source={icon} style={{ width: ICON_PX, height: ICON_PX }} contentFit="contain" />
      <View style={{ width: ICON_TEXT_GAP_PX }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ ...textBase, color: colors.primary, fontWeight: "500" }}>
          {item.primaryText}
        </Text>
        <Text numberOfLines={1} style={{ ...textBase, color: colors.secondary, fontWeight: "400" }}>
          {item.secondaryText}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text numberOfLines={1} style={{ ...textBase, color: colors.primary, fontWeight: "500", textAlign: "right" }}>
          {item.timestamp}
        </Text>
        <Text numberOfLines={1} style={{ ...textBase, color: colors.secondary, fontWeight: "400", textAlign: "right" }}>
          {item.rightText}
        </Text>
      </View>
    </View>
  );
}
