import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useAuthenticatedHomeRouteWideLayout } from "../../ui/authenticatedHomeLayoutWidth";
import { openAuthenticatedHomeRightPanel } from "../../ui/authenticatedHomeRightPanel";
import { SmartScreen } from "../../ui/screens/SmartScreen";

export default function SmartRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const isWide = useAuthenticatedHomeRouteWideLayout();

  useLayoutEffect(() => {
    if (isWide) {
      openAuthenticatedHomeRightPanel("smart");
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

  return <SmartScreen />;
}
