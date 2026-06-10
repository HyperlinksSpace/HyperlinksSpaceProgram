import { Redirect, useLocalSearchParams } from "expo-router";
import { useLayoutEffect } from "react";
import { useWindowDimensions } from "react-native";
import { useAuth } from "../../../auth/AuthContext";
import { openAuthenticatedHomeRightPanel } from "../../../ui/authenticatedHomeRightPanel";
import { SwapScreen } from "../../../ui/screens/SwapScreen";
import { layout } from "../../../ui/theme";

export default function SwapRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > layout.authenticatedHome.firstBreakpoint;

  useLayoutEffect(() => {
    if (isWide) {
      openAuthenticatedHomeRightPanel("swap");
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

  return <SwapScreen />;
}
