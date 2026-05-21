import { View } from "react-native";
import { SwapRateRow } from "./SwapRateRow";
import { SwapStatsRow } from "./SwapStatsRow";
import { layout } from "../theme";

/** Swap panel body: rate row, then seven-column stats row. */
export function SwapPanelContent() {
  return (
    <View
      style={{
        width: "100%",
        alignSelf: "stretch",
        paddingTop: layout.authenticatedHome.swapFirstRowTopInsetPx,
      }}
    >
      <SwapRateRow />
      <View style={{ marginTop: layout.authenticatedHome.swapStatsRowTopGapPx }}>
        <SwapStatsRow />
      </View>
    </View>
  );
}
