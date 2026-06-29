import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useAuthenticatedHomeRouteWideLayout } from "../../ui/authenticatedHomeLayoutWidth";
import { openAuthenticatedHomeRightPanel } from "../../ui/authenticatedHomeRightPanel";
import { focusAuthenticatedHomeMiddleColumnOnHeaderPanel } from "../../ui/authenticatedHomeSelectedChat";
import { GetScreen } from "../../ui/screens/GetScreen";

export default function GetRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const isWide = useAuthenticatedHomeRouteWideLayout();

  useLayoutEffect(() => {
    if (isWide) {
      openAuthenticatedHomeRightPanel("get");
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

  return <GetScreen />;
}
