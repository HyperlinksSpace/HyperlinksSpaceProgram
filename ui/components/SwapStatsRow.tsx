import { Text, View } from "react-native";
import { typographyAeroport10, useColors } from "../theme";

const SWAP_STATS_COLUMNS = [
  { label: "HLDRS", value: "$3.1K" },
  { label: "FDV", value: "$7K" },
  { label: "VOL", value: "$1.1K" },
  { label: "5H", value: "$3.1K" },
  { label: "1H", value: "+208.13%" },
  { label: "6H", value: "+208.13%" },
  { label: "6H", value: "+208.13%" },
] as const;

/**
 * Second swap row: seven equal columns; label (primary) and value (secondary), 10px / 20px Aeroport.
 */
export function SwapStatsRow() {
  const colors = useColors();
  const labelStyle = [typographyAeroport10, { color: colors.primary, textAlign: "center" as const }];
  const valueStyle = [typographyAeroport10, { color: colors.secondary, textAlign: "center" as const }];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      {SWAP_STATS_COLUMNS.map(({ label, value }, index) => (
        <View
          key={`${index}-${label}`}
          style={{
            flex: 1,
            minWidth: 0,
            alignItems: "center",
            justifyContent: "flex-start",
          }}
        >
          <Text style={labelStyle} numberOfLines={1}>
            {label}
          </Text>
          <Text style={valueStyle} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}
