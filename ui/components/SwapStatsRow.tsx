import { Text, View } from "react-native";
import type { SwapMarketStats } from "../swap/fetchSwapChart";
import { formatSwapNumber, formatSwapPercentage } from "../swap/swapChartFormat";
import { typographyAeroport10, useColors } from "../theme";

type StatColumn = { label: string; value: string };

function buildColumns(stats: SwapMarketStats | null): StatColumn[] {
  return [
    { label: "MCAP", value: formatSwapNumber(stats?.mcap, true) },
    { label: "FDMC", value: formatSwapNumber(stats?.fdmc, true) },
    { label: "VOL", value: formatSwapNumber(stats?.volume24h, true) },
    { label: "5M", value: formatSwapPercentage(stats?.priceChange5m) },
    { label: "1H", value: formatSwapPercentage(stats?.priceChange1h) },
    { label: "6H", value: formatSwapPercentage(stats?.priceChange6h) },
    { label: "24H", value: formatSwapPercentage(stats?.priceChange24h) },
  ];
}

type Props = {
  marketStats: SwapMarketStats | null;
};

/** Stats legend row — Aeroport regular (labels + values). */
export function SwapStatsRow({ marketStats }: Props) {
  const colors = useColors();
  const columns = buildColumns(marketStats);
  const labelStyle = [typographyAeroport10, { color: colors.primary, textAlign: "center" as const }];
  const valueStyle = [typographyAeroport10, { color: colors.secondary, textAlign: "center" as const }];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-around",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      {columns.map((col, index) => (
        <View
          key={`${index}-${col.label}`}
          style={{
            alignItems: "center",
            justifyContent: "flex-start",
          }}
        >
          <Text style={labelStyle} numberOfLines={1}>
            {col.label}
          </Text>
          <View style={{ height: 5 }} />
          <Text style={valueStyle} numberOfLines={1}>
            {col.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
