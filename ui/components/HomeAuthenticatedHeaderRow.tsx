import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import {
  homeWalletAddressHeaderText,
  layout,
  useColors,
} from "../theme";

const AH = layout.authenticatedHome;

/** Header actions — `assets/header/*.svg` (fixed palette in asset; optional tint later). */
const HEADER_ICONS: readonly { source: number; accessibilityLabel: string }[] = [
  { source: require("../../assets/header/copy.svg"), accessibilityLabel: "Copy wallet address" },
  { source: require("../../assets/header/edit.svg"), accessibilityLabel: "Edit" },
  { source: require("../../assets/header/key.svg"), accessibilityLabel: "Key" },
  { source: require("../../assets/header/ru.svg"), accessibilityLabel: "Language" },
  { source: require("../../assets/header/exit.svg"), accessibilityLabel: "Exit" },
];

type Props = {
  /** Raw wallet address; truncated visually with ellipsis. */
  walletAddress: string;
};

/**
 * Top row on authenticated home: truncated address (highlight) + header icons, space-between cluster.
 */
export function HomeAuthenticatedHeaderRow({ walletAddress }: Props) {
  const colors = useColors();
  const trimmed = walletAddress.replace(/\s+/g, "").trim();
  const display = trimmed.length > 0 ? trimmed : "…";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        marginBottom: 12,
      }}
    >
      <Text
        style={[
          homeWalletAddressHeaderText,
          {
            color: colors.highlight,
            flex: 1,
            minWidth: 0,
            marginRight: AH.addressRowGap,
          },
        ]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {display}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexShrink: 0,
          gap: AH.headerIconGap,
        }}
      >
        {HEADER_ICONS.map(({ source, accessibilityLabel }) => (
          <Pressable
            key={accessibilityLabel}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            hitSlop={8}
            onPress={() => {
              /* Wired when flows land */
            }}
          >
            <Image
              source={source}
              style={{
                width: AH.headerIconDisplaySize,
                height: AH.headerIconDisplaySize,
              }}
              contentFit="contain"
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
