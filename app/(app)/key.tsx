import { View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { CenteredLogoOnlyHeader } from "../../ui/components/CenteredLogoOnlyHeader";
import { useColors } from "../../ui/theme";

/** Route `/key` — opened from the authenticated header key icon. */
export default function KeyScreen() {
  const { isAuthenticated, authReady } = useAuth();
  const colors = useColors();

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <CenteredLogoOnlyHeader />
      <View style={{ flex: 1 }} />
    </View>
  );
}
