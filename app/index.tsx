import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { WelcomeContent } from "../ui/components/WelcomeContent";
import { getBuildDisplaySnapshot, logPageDisplay } from "../ui/pageDisplayLog";
import { HomeAuthenticatedScreen } from "../ui/screens/HomeAuthenticatedScreen";
import { useColors } from "../ui/theme";

/**
 * Root URL `http://localhost:3000/` (path `/`): welcome when signed out, main app when signed in.
 * Same URL for both — only session state chooses the screen; legacy `/home` redirects here.
 *
 * Welcome is shown immediately on first paint; session bootstrap runs in parallel (`AuthProvider`).
 * If the session is valid, we switch to the authenticated home once `authReady` (brief welcome → home
 * only for returning signed-in users).
 */
export default function Index() {
  const colors = useColors();
  const { isAuthenticated, authReady, authHydrated } = useAuth();
  const lastLoggedVariantRef = useRef<string | null>(null);

  useEffect(() => {
    const variant = !authHydrated
      ? "bootstrap_pending_hydration"
      : !authReady
        ? "bootstrap_pending_auth"
      : isAuthenticated
        ? "home_authenticated"
        : "welcome";
    if (lastLoggedVariantRef.current === variant) return;
    lastLoggedVariantRef.current = variant;
    logPageDisplay("index_route", {
      variant,
      sessionPending: !authReady,
      authHydrated,
      authReady,
      isAuthenticated,
      build: getBuildDisplaySnapshot(),
    });
  }, [authHydrated, authReady, isAuthenticated]);

  if (!authHydrated || !authReady) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (isAuthenticated) {
    return <HomeAuthenticatedScreen />;
  }
  return <WelcomeContent />;
}
