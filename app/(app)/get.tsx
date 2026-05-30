import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";
import { useWindowDimensions } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { openAuthenticatedHomeRightPanel } from "../../ui/authenticatedHomeRightPanel";
import { GetScreen } from "../../ui/screens/GetScreen";
import { layout } from "../../ui/theme";

export default function GetRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > layout.authenticatedHome.firstBreakpoint;

  useLayoutEffect(() => {
    if (isWide) {
      openAuthenticatedHomeRightPanel("get");
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
