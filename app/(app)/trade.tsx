import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useAuthenticatedHomeRouteWideLayout } from "../../ui/authenticatedHomeLayoutWidth";
import { openAuthenticatedHomeRightPanel } from "../../ui/authenticatedHomeRightPanel";
import { TradeScreen } from "../../ui/screens/TradeScreen";

export default function TradeRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const isWide = useAuthenticatedHomeRouteWideLayout();

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
