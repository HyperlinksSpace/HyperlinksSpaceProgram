import { Platform, Text, View } from "react-native";
import { typographyAeroport15, typographyAeroport20, useColors } from "../theme";

const INTERVAL_LETTERS = ["m", "q", "h", "d"] as const;

/**
 * Single swap summary row: asset label · interval letters · price (three columns, space-between).
 */
export function SwapRateRow() {
  const colors = useColors();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      <Text style={[typographyAeroport20, { color: colors.primary, flexShrink: 1 }]} numberOfLines={1}>
        TON (Day)
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexGrow: 1,
          flexShrink: 0,
          minWidth: Platform.OS === "web" ? 72 : 56,
          maxWidth: 120,
          marginHorizontal: 12,
        }}
      >
        {INTERVAL_LETTERS.map((letter) => (
          <Text key={letter} style={[typographyAeroport15, { color: colors.primary }]}>
            {letter}
          </Text>
        ))}
      </View>
      <Text style={[typographyAeroport15, { color: colors.primary, flexShrink: 0 }]} numberOfLines={1}>
        $1.47
      </Text>
    </View>
  );
}
