import { Redirect } from "expo-router";
import { useLayoutEffect } from "react";
import { useWindowDimensions } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { openAuthenticatedHomeRightPanel } from "../../ui/authenticatedHomeRightPanel";
import { SmartsScreen } from "../../ui/screens/SmartsScreen";
import { layout } from "../../ui/theme";

export default function SmartsRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > layout.authenticatedHome.firstBreakpoint;

  useLayoutEffect(() => {
    if (isWide) {
      openAuthenticatedHomeRightPanel("smarts");
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

  return <SmartsScreen />;
}
