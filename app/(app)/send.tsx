import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useAuthenticatedHomeRouteWideLayout } from "../../ui/authenticatedHomeLayoutWidth";
import { openAuthenticatedHomeRightPanel } from "../../ui/authenticatedHomeRightPanel";
import { focusAuthenticatedHomeMiddleColumnOnHeaderPanel } from "../../ui/authenticatedHomeSelectedChat";
import { SendScreen } from "../../ui/screens/SendScreen";

export default function SendRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const isWide = useAuthenticatedHomeRouteWideLayout();

  useLayoutEffect(() => {
    if (isWide) {
      openAuthenticatedHomeRightPanel("send");
      focusAuthenticatedHomeMiddleColumnOnHeaderPanel();
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

  return <SendScreen />;
}
