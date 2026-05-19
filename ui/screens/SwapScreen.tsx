import { View } from "react-native";
import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SwapRateRow } from "../components/SwapRateRow";
import { layout } from "../theme";

export function SwapScreen() {
  return (
    <AuthenticatedAppShell>
      <View
        style={{
          width: "100%",
          alignSelf: "stretch",
          paddingTop: layout.authenticatedHome.swapFirstRowTopInsetPx,
        }}
      >
        <SwapRateRow />
      </View>
    </AuthenticatedAppShell>
  );
}
