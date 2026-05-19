import { Platform, Text, View } from "react-native";
import { typographyAeroport15, typographyAeroport20, useColors } from "../theme";

const INTERVAL_LETTERS = ["m", "q", "h", "d"] as const;

/** Width of the centered interval letter group (m q h d spaced inside). */
const INTERVAL_GROUP_WIDTH_PX = Platform.OS === "web" ? 72 : 56;

/**
 * Single swap summary row: asset label · interval letters (row-centered) · price.
 */
export function SwapRateRow() {
  const colors = useColors();

  return (
    <View
      style={{
        width: "100%",
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        position: "relative",
      }}
    >
      <View style={{ flex: 1, alignItems: "flex-start", minWidth: 0, paddingRight: 8 }}>
        <Text style={[typographyAeroport20, { color: colors.primary }]} numberOfLines={1}>
          TON (Day)
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: "flex-end", minWidth: 0, paddingLeft: 8 }}>
        <Text style={[typographyAeroport15, { color: colors.primary }]} numberOfLines={1}>
          $1.47
        </Text>
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: INTERVAL_GROUP_WIDTH_PX,
          }}
        >
          {INTERVAL_LETTERS.map((letter) => (
            <Text key={letter} style={[typographyAeroport15, { color: colors.primary }]}>
              {letter}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
