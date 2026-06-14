import { Redirect, useLocalSearchParams } from "expo-router";
import { useLayoutEffect } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useAuthenticatedHomeRouteWideLayout } from "../../../ui/authenticatedHomeLayoutWidth";
import { openAuthenticatedHomeRightPanel } from "../../../ui/authenticatedHomeRightPanel";
import { SwapScreen } from "../../../ui/screens/SwapScreen";

export default function SwapRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const isWide = useAuthenticatedHomeRouteWideLayout();

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
