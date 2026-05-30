import { Pressable, Text, View, Platform } from "react-native";
import {
  TRANSFER_WALLET_NAME,
  TRANSFER_WALLET_SNIPPET,
} from "../../transfer/transferSampleData";
import { typographyAeroport15, useColors } from "../../theme";
import { WEB_UI_MONO_STACK } from "../../fonts";
import { SwapSelectChevron } from "../swap/SwapFormIcons";

const TITLE_ROW_HEIGHT_PX = 30;
const CHEVRON_GAP_PX = 5;

const titleSecondaryStyle = [
  typographyAeroport15,
  { lineHeight: TITLE_ROW_HEIGHT_PX, fontWeight: "400" as const },
];

type Props = {
  walletSnippet?: string;
  displayName?: string;
  onWalletPress?: () => void;
};

/** prev-main send/get title row: wallet snippet · wallet name + chevron. */
export function SendGetTitleRow({
  walletSnippet = TRANSFER_WALLET_SNIPPET,
  displayName = TRANSFER_WALLET_NAME,
  onWalletPress,
}: Props) {
  const colors = useColors();
  const secondary = { color: colors.secondary };

  const rightRow = (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text style={[titleSecondaryStyle, secondary]}>{displayName}</Text>
      <View style={{ width: CHEVRON_GAP_PX }} />
      <SwapSelectChevron />
    </View>
  );

  return (
    <View
      style={{
        height: TITLE_ROW_HEIGHT_PX,
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      <Text
        style={[
          titleSecondaryStyle,
          secondary,
          {
            flex: 1,
            minWidth: 0,
            fontFamily: Platform.OS === "web" ? WEB_UI_MONO_STACK : undefined,
          },
        ]}
        numberOfLines={1}
      >
        {walletSnippet}
      </Text>
      {onWalletPress ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onWalletPress}
          style={{ flexDirection: "row", alignItems: "center", flexShrink: 0 }}
        >
          {rightRow}
        </Pressable>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 0 }}>{rightRow}</View>
      )}
    </View>
  );
}
