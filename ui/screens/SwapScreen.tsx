import { View } from "react-native";
import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SwapRateRow } from "../components/SwapRateRow";

export function SwapScreen() {
  return (
    <AuthenticatedAppShell>
      <View style={{ width: "100%", alignSelf: "stretch", paddingTop: 8 }}>
        <SwapRateRow />
      </View>
    </AuthenticatedAppShell>
  );
}
