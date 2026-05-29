import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";
import { useWindowDimensions } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { openAuthenticatedHomeRightPanel } from "../../ui/authenticatedHomeRightPanel";
import { TradeScreen } from "../../ui/screens/TradeScreen";
import { layout } from "../../ui/theme";

export default function TradeRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > layout.authenticatedHome.firstBreakpoint;

  useLayoutEffect(() => {
    if (isWide) {
      openAuthenticatedHomeRightPanel("trade");
    }
  }, [isWide]);

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }
  if (isWide) {
    return <Redirect href="/" />;
  }

  return <TradeScreen />;
}
