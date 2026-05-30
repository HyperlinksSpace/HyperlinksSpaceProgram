import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";
import { useWindowDimensions } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { openAuthenticatedHomeRightPanel } from "../../ui/authenticatedHomeRightPanel";
import { SendScreen } from "../../ui/screens/SendScreen";
import { layout } from "../../ui/theme";

export default function SendRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > layout.authenticatedHome.firstBreakpoint;

  useLayoutEffect(() => {
    if (isWide) {
      openAuthenticatedHomeRightPanel("send");
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
